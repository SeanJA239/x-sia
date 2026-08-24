import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import app from '../src/index'
import { createTestUser, grantAdmin, sessionTokenFor } from './helpers'

function authed(token: string, init: RequestInit = {}) {
  return {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  }
}

async function createPost(
  token: string,
  body: { kind: 'wall' | 'article'; title: string; body_md: string },
) {
  const res = await app.request(
    '/api/v1/posts',
    authed(token, { method: 'POST', body: JSON.stringify(body) }),
    env,
  )
  return { res, json: (await res.json()) as { id: string } }
}

describe('posts and comments', () => {
  it('POST /posts and POST /posts/:id/comments return the contract-specified shapes', async () => {
    const email = `post-shape-${crypto.randomUUID()}@t.com`
    const { userId } = await createTestUser({ email, status: 'active' })
    const token = await sessionTokenFor(userId)

    const { res, json } = await createPost(token, {
      kind: 'wall',
      title: '形状测试',
      body_md: '正文内容',
    })
    expect(res.status).toBe(201)
    const post = json as unknown as Record<string, unknown>
    expect(Object.keys(post).sort()).toEqual(
      ['id', 'kind', 'title', 'body_md', 'author', 'created_at'].sort(),
    )
    expect(post.author).toEqual({ id: userId, display_name: email })

    const commentRes = await app.request(
      `/api/v1/posts/${json.id}/comments`,
      authed(token, { method: 'POST', body: JSON.stringify({ body: '评论内容' }) }),
      env,
    )
    expect(commentRes.status).toBe(201)
    const comment = (await commentRes.json()) as Record<string, unknown>
    expect(Object.keys(comment).sort()).toEqual(['id', 'body', 'author', 'created_at'].sort())
    expect(comment.author).toEqual({ id: userId, display_name: email })
  })

  it('rejects a non-active member from posting with 403', async () => {
    const { userId } = await createTestUser({ email: `post-inactive-${crypto.randomUUID()}@t.com` })
    const token = await sessionTokenFor(userId)
    const { res } = await createPost(token, { kind: 'wall', title: 't', body_md: 'body' })
    expect(res.status).toBe(403)
  })

  it('active member creates a post, it shows up in listing and detail', async () => {
    const { userId } = await createTestUser({
      email: `post-active-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const token = await sessionTokenFor(userId)
    const { res, json } = await createPost(token, {
      kind: 'article',
      title: '**加粗标题**',
      body_md: '# 标题\n\n这是正文内容，用来测试摘要截取是否正常工作而且长度足够。',
    })
    expect(res.status).toBe(201)

    const listRes = await app.request(`/api/v1/posts?kind=article`, authed(token), env)
    const list = (await listRes.json()) as {
      items: { id: string; excerpt: string; comment_count: number }[]
    }
    const found = list.items.find((i) => i.id === json.id)
    expect(found).toBeDefined()
    expect(found?.comment_count).toBe(0)
    expect(found?.excerpt).not.toMatch(/[#*]/) // markdown 标记已被粗糙去除

    const detailRes = await app.request(`/api/v1/posts/${json.id}`, authed(token), env)
    const detail = (await detailRes.json()) as { comments: unknown[]; body_md: string }
    expect(detail.comments).toHaveLength(0)
    expect(detail.body_md).toContain('# 标题')
  })

  it('kind filter only returns posts of that kind', async () => {
    const { userId } = await createTestUser({
      email: `post-kind-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const token = await sessionTokenFor(userId)
    const wall = await createPost(token, { kind: 'wall', title: 'w', body_md: 'wall body' })
    const article = await createPost(token, {
      kind: 'article',
      title: 'a',
      body_md: 'article body',
    })

    const wallList = (await (
      await app.request('/api/v1/posts?kind=wall', authed(token), env)
    ).json()) as { items: { id: string }[] }
    expect(wallList.items.some((i) => i.id === wall.json.id)).toBe(true)
    expect(wallList.items.some((i) => i.id === article.json.id)).toBe(false)
  })

  it('comment permission matrix: active can comment, non-active cannot, comment on removed post 404s', async () => {
    const { userId: authorId } = await createTestUser({
      email: `post-author-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const authorToken = await sessionTokenFor(authorId)
    const { json: postJson } = await createPost(authorToken, {
      kind: 'wall',
      title: 't',
      body_md: 'body',
    })

    const { userId: inactiveId } = await createTestUser({
      email: `post-commenter-inactive-${crypto.randomUUID()}@t.com`,
    })
    const inactiveToken = await sessionTokenFor(inactiveId)
    const rejected = await app.request(
      `/api/v1/posts/${postJson.id}/comments`,
      authed(inactiveToken, { method: 'POST', body: JSON.stringify({ body: 'hi' }) }),
      env,
    )
    expect(rejected.status).toBe(403)

    const { userId: commenterId } = await createTestUser({
      email: `post-commenter-active-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const commenterToken = await sessionTokenFor(commenterId)
    const commentRes = await app.request(
      `/api/v1/posts/${postJson.id}/comments`,
      authed(commenterToken, { method: 'POST', body: JSON.stringify({ body: '很棒' }) }),
      env,
    )
    expect(commentRes.status).toBe(201)
    const commentJson = (await commentRes.json()) as { id: string }

    const listRes = await app.request(`/api/v1/posts`, authed(authorToken), env)
    const list = (await listRes.json()) as { items: { id: string; comment_count: number }[] }
    expect(list.items.find((i) => i.id === postJson.id)?.comment_count).toBe(1)

    // 作者软删帖子后，评论接口应该视其为不存在
    const delRes = await app.request(
      `/api/v1/posts/${postJson.id}`,
      authed(authorToken, { method: 'DELETE' }),
      env,
    )
    expect(delRes.status).toBe(204)

    const commentAfterRemove = await app.request(
      `/api/v1/posts/${postJson.id}/comments`,
      authed(commenterToken, { method: 'POST', body: JSON.stringify({ body: '还能评论吗' }) }),
      env,
    )
    expect(commentAfterRemove.status).toBe(404)

    // 非作者非 admin 看不到已软删的帖子详情
    const detailAsOther = await app.request(
      `/api/v1/posts/${postJson.id}`,
      authed(commenterToken),
      env,
    )
    expect(detailAsOther.status).toBe(404)
    // 作者本人仍能看到自己的软删帖子
    const detailAsAuthor = await app.request(
      `/api/v1/posts/${postJson.id}`,
      authed(authorToken),
      env,
    )
    expect(detailAsAuthor.status).toBe(200)

    // 评论本身没被软删逻辑影响，仍可被作者删除（硬删）
    const delComment = await app.request(
      `/api/v1/comments/${commentJson.id}`,
      authed(commenterToken, { method: 'DELETE' }),
      env,
    )
    expect(delComment.status).toBe(204)
  })

  it('only the post author or an admin can delete a post; admin can delete others posts', async () => {
    const { org, userId: authorId } = await createTestUser({
      email: `post-owner-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const authorToken = await sessionTokenFor(authorId)
    const { json: postJson } = await createPost(authorToken, {
      kind: 'wall',
      title: 't',
      body_md: 'b',
    })

    const { userId: strangerId } = await createTestUser({
      email: `post-stranger-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const strangerToken = await sessionTokenFor(strangerId)
    const forbidden = await app.request(
      `/api/v1/posts/${postJson.id}`,
      authed(strangerToken, { method: 'DELETE' }),
      env,
    )
    expect(forbidden.status).toBe(403)

    const { userId: adminId } = await createTestUser({
      email: `post-admin-${crypto.randomUUID()}@t.com`,
    })
    await grantAdmin(org.id, adminId)
    const adminToken = await sessionTokenFor(adminId)
    const asAdmin = await app.request(
      `/api/v1/posts/${postJson.id}`,
      authed(adminToken, { method: 'DELETE' }),
      env,
    )
    expect(asAdmin.status).toBe(204)
  })
})
