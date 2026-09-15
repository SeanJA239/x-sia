import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { entitlement, org, wikiPage, wikiRevision } from '../src/db/schema'
import app from '../src/index'
import { newId } from '../src/lib/id'
import { createTestUser, db, getOrCreateOrg, grantAdmin, sessionTokenFor } from './helpers'

async function actor(kind?: string, expiresAt?: string, revokedAt?: string) {
  const u = await createTestUser({ email: `wiki-${newId()}@t.com`, status: 'active' })
  if (kind === 'admin') await grantAdmin(u.org.id, u.userId)
  else if (kind)
    await db().insert(entitlement).values({
      id: newId(),
      orgId: u.org.id,
      userId: u.userId,
      kind,
      grantedAt: new Date().toISOString(),
      expiresAt,
      revokedAt,
    })
  return { ...u, token: await sessionTokenFor(u.userId) }
}
function req(path: string, method = 'GET', token?: string, body?: unknown) {
  return app.request(
    `/api/v1/wiki${path}`,
    {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  )
}
const content = (extra = {}) => ({
  title: 'Wiki 测试',
  summary: '测试摘要',
  category: '测试分类',
  body_md: '## 开始\n\n公开知识测试',
  change_note: '初始版本',
  ...extra,
})
async function create(token: string, extra = {}) {
  const slug = `test-${newId()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')}`
  const res = await req('/manage/pages', 'POST', token, { slug, ...content(extra) })
  expect(res.status).toBe(201)
  return { ...((await res.json()) as { id: string; version: number }), slug }
}

describe('dynamic wiki', () => {
  it('protects management; only explicit unexpired, unrevoked wiki rights apply', async () => {
    await getOrCreateOrg()
    expect((await req('/manage/pages')).status).toBe(401)
    for (const a of [
      await actor(),
      await actor('wiki_editor', '2000-01-01T00:00:00Z'),
      await actor('wiki_admin', undefined, '2026-01-01T00:00:00Z'),
    ]) {
      expect((await req('/manage/pages', 'GET', a.token)).status).toBe(403)
      expect(
        (await req('/manage/pages', 'POST', a.token, { slug: 'forbidden', ...content() })).status,
      ).toBe(403)
    }
  })

  it('supports draft -> publish -> edit privately -> republish -> restore -> unpublish', async () => {
    const a = await actor('wiki_admin')
    const p = await create(a.token)
    expect((await req(`/pages/${p.slug}`)).status).toBe(404)
    expect((await req(`/manage/pages/${p.id}/revisions`)).status).toBe(401)
    const initial = (await (await req(`/manage/pages/${p.id}`, 'GET', a.token)).json()) as {
      draft: { id: string }
    }
    expect(
      (await req(`/manage/pages/${p.id}/publish`, 'POST', a.token, { expected_version: 1 })).status,
    ).toBe(200)
    const published = await req(`/pages/${p.slug}`)
    expect(published.status).toBe(200)
    expect(published.headers.get('Cache-Control')).toBe('no-store')
    expect(await published.json()).toMatchObject({ title: 'Wiki 测试', revision_number: 1 })

    expect(
      (
        await req(
          `/manage/pages/${p.id}`,
          'PUT',
          a.token,
          content({
            expected_version: 2,
            title: '私有标题',
            body_md: 'never-public-needle',
            category: '私有分类',
          }),
        )
      ).status,
    ).toBe(200)
    expect(await (await req(`/pages/${p.slug}`)).json()).toMatchObject({
      title: 'Wiki 测试',
      category: '测试分类',
    })
    const search = (await (await req('/pages?q=never-public-needle')).json()) as {
      items: unknown[]
      categories: { category: string }[]
    }
    expect(search.items).toHaveLength(0)
    expect(search.categories.some((c) => c.category === '私有分类')).toBe(false)
    expect(
      (await req(`/manage/pages/${p.id}/publish`, 'POST', a.token, { expected_version: 3 })).status,
    ).toBe(200)
    expect(await (await req(`/pages/${p.slug}`)).json()).toMatchObject({ title: '私有标题' })

    const revision = await (
      await req(`/manage/pages/${p.id}/revisions/${initial.draft.id}`, 'GET', a.token)
    ).json()
    expect(revision).toMatchObject({ title: 'Wiki 测试' })
    expect(
      (
        await req(
          `/manage/pages/${p.id}`,
          'PUT',
          a.token,
          content({ expected_version: 4, change_note: '恢复初始版本' }),
        )
      ).status,
    ).toBe(200)
    expect(
      (await req(`/manage/pages/${p.id}/publish`, 'POST', a.token, { expected_version: 5 })).status,
    ).toBe(200)
    expect(await (await req(`/pages/${p.slug}`)).json()).toMatchObject({ title: 'Wiki 测试' })
    expect(
      (await req(`/manage/pages/${p.id}/unpublish`, 'POST', a.token, { expected_version: 6 }))
        .status,
    ).toBe(200)
    expect((await req(`/pages/${p.slug}`)).status).toBe(404)
    const list = (await (await req('/pages')).json()) as { items: { id: string }[] }
    expect(list.items.some((i) => i.id === p.id)).toBe(false)
  })

  it('lets editors save but not publish, including direct API calls', async () => {
    const a = await actor('wiki_editor')
    const p = await create(a.token)
    expect(await (await req('/access', 'GET', a.token)).json()).toEqual({
      can_edit: true,
      can_publish: false,
    })
    for (const action of ['publish', 'unpublish']) {
      expect(
        (await req(`/manage/pages/${p.id}/${action}`, 'POST', a.token, { expected_version: 1 }))
          .status,
      ).toBe(403)
    }
    expect(
      (await req(`/manage/pages/${p.id}`, 'PUT', a.token, content({ expected_version: 1 }))).status,
    ).toBe(200)
  })

  it('allows only one concurrent save and creates no losing revision or audit', async () => {
    const a = await actor('admin')
    const p = await create(a.token)
    const responses = await Promise.all([
      req(`/manage/pages/${p.id}`, 'PUT', a.token, content({ expected_version: 1, title: 'A' })),
      req(`/manage/pages/${p.id}`, 'PUT', a.token, content({ expected_version: 1, title: 'B' })),
    ])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const history = (await (
      await req(`/manage/pages/${p.id}/revisions`, 'GET', a.token)
    ).json()) as { total: number }
    expect(history.total).toBe(2)
    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE target_id = ? AND action = 'wiki.save'",
    )
      .bind(p.id)
      .first<{ n: number }>()
    expect(audit?.n).toBe(1)
    expect(
      (await req(`/manage/pages/${p.id}/publish`, 'POST', a.token, { expected_version: 1 })).status,
    ).toBe(409)
    expect((await req(`/pages/${p.slug}`)).status).toBe(404)
  })

  it('validates input and duplicate slugs without leaving partial pages', async () => {
    const a = await actor('admin')
    const p = await create(a.token)
    expect(
      (await req('/manage/pages', 'POST', a.token, { slug: p.slug, ...content() })).status,
    ).toBe(409)
    expect(
      (await req('/manage/pages', 'POST', a.token, { slug: '../unsafe', ...content() })).status,
    ).toBe(400)
    expect(
      (
        await req('/manage/pages', 'POST', a.token, {
          slug: 'empty',
          ...content({ body_md: '   ' }),
        })
      ).status,
    ).toBe(400)
    expect((await req('/pages?page=-1')).status).toBe(400)
    expect(
      (
        await req('/manage/pages', 'POST', a.token, {
          slug: 'too-large',
          ...content({ body_md: 'x'.repeat(600000) }),
        })
      ).status,
    ).toBe(413)
  })

  it('searches Chinese published content with literal wildcard handling', async () => {
    const a = await actor('admin')
    const p = await create(a.token, { body_md: '中文子串检索甲乙丙 100%_complete' })
    await req(`/manage/pages/${p.id}/publish`, 'POST', a.token, { expected_version: 1 })
    for (const q of ['检索甲乙丙', '%_complete']) {
      const list = (await (await req(`/pages?q=${encodeURIComponent(q)}`)).json()) as {
        items: { id: string }[]
      }
      expect(list.items.some((i) => i.id === p.id)).toBe(true)
    }
  })

  it('does not expose or mutate another organization’s page or revision', async () => {
    const a = await actor('admin')
    const otherOrg = newId(),
      pageId = newId(),
      rid = newId(),
      now = new Date().toISOString()
    await db()
      .insert(org)
      .values({ id: otherOrg, slug: `org-${newId()}`, name: 'Other', createdAt: now })
    await db().insert(wikiPage).values({
      id: pageId,
      orgId: otherOrg,
      slug: 'foreign-page',
      draftRevisionId: rid,
      publishedRevisionId: rid,
      lastMutationId: newId(),
      createdAt: now,
      updatedAt: now,
    })
    await db().insert(wikiRevision).values({
      id: rid,
      orgId: otherOrg,
      pageId,
      number: 1,
      title: 'Foreign',
      bodyMd: 'foreign-secret',
      changeNote: 'init',
      authorId: a.userId,
      createdAt: now,
    })
    expect((await req('/pages/foreign-page')).status).toBe(404)
    expect((await req(`/manage/pages/${pageId}`, 'GET', a.token)).status).toBe(404)
    expect((await req(`/manage/pages/${pageId}/revisions/${rid}`, 'GET', a.token)).status).toBe(404)
    expect(
      (await req(`/manage/pages/${pageId}`, 'PUT', a.token, content({ expected_version: 1 })))
        .status,
    ).toBe(404)
  })
})
