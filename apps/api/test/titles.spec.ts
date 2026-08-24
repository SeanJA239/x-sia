import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import app from '../src/index'
import { createEvent, createTestUser, grantAdmin, sessionTokenFor } from './helpers'

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

async function setupAdmin() {
  const { org, userId } = await createTestUser({
    email: `title-admin-${crypto.randomUUID()}@t.com`,
  })
  await grantAdmin(org.id, userId)
  return { org, adminToken: await sessionTokenFor(userId) }
}

describe('titles: worn fallback chain', () => {
  it('falls back to null -> latest granted -> explicit worn -> latest again after clearing', async () => {
    const { adminToken } = await setupAdmin()
    const { userId: targetId } = await createTestUser({
      email: `title-target-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const targetToken = await sessionTokenFor(targetId)

    // 一个称号都没有：卡片/公开页 title 为 null
    const cardBefore = (await (
      await app.request('/api/v1/card', authed(targetToken), env)
    ).json()) as { title: string | null }
    expect(cardBefore.title).toBeNull()

    const publicBefore = (await (
      await app.request(`/api/v1/users/${targetId}/public`, {}, env)
    ).json()) as { title: string | null }
    expect(publicBefore.title).toBeNull()

    // 授予第一个称号
    const def1 = (await (
      await app.request(
        '/api/v1/admin/titles',
        authed(adminToken, { method: 'POST', body: JSON.stringify({ name: '称号一' }) }),
        env,
      )
    ).json()) as { id: string; name: string }

    const grant1 = (await (
      await app.request(
        `/api/v1/admin/users/${targetId}/titles`,
        authed(adminToken, { method: 'POST', body: JSON.stringify({ title_def_id: def1.id }) }),
        env,
      )
    ).json()) as { id: string; worn: boolean }
    expect(grant1.worn).toBe(true) // 未佩戴任何东西时，唯一一个自动成为「有效佩戴」

    const cardAfterFirst = (await (
      await app.request('/api/v1/card', authed(targetToken), env)
    ).json()) as { title: string | null }
    expect(cardAfterFirst.title).toBe('称号一')

    // 授予第二个称号：未显式佩戴过，回落规则是"最新授予"，所以有效佩戴切到第二个
    const def2 = (await (
      await app.request(
        '/api/v1/admin/titles',
        authed(adminToken, { method: 'POST', body: JSON.stringify({ name: '称号二' }) }),
        env,
      )
    ).json()) as { id: string; name: string }

    const grant2 = (await (
      await app.request(
        `/api/v1/admin/users/${targetId}/titles`,
        authed(adminToken, { method: 'POST', body: JSON.stringify({ title_def_id: def2.id }) }),
        env,
      )
    ).json()) as { id: string; worn: boolean }
    expect(grant2.worn).toBe(true)

    const cardAfterSecond = (await (
      await app.request('/api/v1/card', authed(targetToken), env)
    ).json()) as { title: string | null }
    expect(cardAfterSecond.title).toBe('称号二')

    // 显式佩戴回第一个
    const wearFirst = await app.request(
      '/api/v1/me/worn-title',
      authed(targetToken, { method: 'PUT', body: JSON.stringify({ user_title_id: grant1.id }) }),
      env,
    )
    expect(wearFirst.status).toBe(200)

    const myTitles = (await (
      await app.request('/api/v1/me/titles', authed(targetToken), env)
    ).json()) as { items: { id: string; worn: boolean }[] }
    expect(myTitles.items.find((i) => i.id === grant1.id)?.worn).toBe(true)
    expect(myTitles.items.find((i) => i.id === grant2.id)?.worn).toBe(false)

    const cardAfterExplicit = (await (
      await app.request('/api/v1/card', authed(targetToken), env)
    ).json()) as { title: string | null }
    expect(cardAfterExplicit.title).toBe('称号一')

    // 取消佩戴：回落到最新授予的（第二个）
    const unwear = await app.request(
      '/api/v1/me/worn-title',
      authed(targetToken, { method: 'PUT', body: JSON.stringify({ user_title_id: null }) }),
      env,
    )
    expect(unwear.status).toBe(200)

    const cardAfterUnwear = (await (
      await app.request('/api/v1/card', authed(targetToken), env)
    ).json()) as { title: string | null }
    expect(cardAfterUnwear.title).toBe('称号二')
  })

  it('rejects wearing a title that does not belong to the requester', async () => {
    const { adminToken } = await setupAdmin()
    const { userId: ownerId } = await createTestUser({
      email: `title-owner-${crypto.randomUUID()}@t.com`,
    })
    const { userId: strangerId } = await createTestUser({
      email: `title-stranger-${crypto.randomUUID()}@t.com`,
    })
    const strangerToken = await sessionTokenFor(strangerId)

    const def = (await (
      await app.request(
        '/api/v1/admin/titles',
        authed(adminToken, { method: 'POST', body: JSON.stringify({ name: '别人的称号' }) }),
        env,
      )
    ).json()) as { id: string }
    const grant = (await (
      await app.request(
        `/api/v1/admin/users/${ownerId}/titles`,
        authed(adminToken, { method: 'POST', body: JSON.stringify({ title_def_id: def.id }) }),
        env,
      )
    ).json()) as { id: string }

    const res = await app.request(
      '/api/v1/me/worn-title',
      authed(strangerToken, { method: 'PUT', body: JSON.stringify({ user_title_id: grant.id }) }),
      env,
    )
    expect(res.status).toBe(404)
  })
})

describe('certificates', () => {
  it('issues a certificate with the documented serial format and it is publicly verifiable', async () => {
    const { org, adminToken } = await setupAdmin()
    const { userId: holderId } = await createTestUser({
      email: `cert-holder-${crypto.randomUUID()}@t.com`,
    })
    const eventId = await createEvent({ orgId: org.id })

    const issueRes = await app.request(
      `/api/v1/admin/users/${holderId}/certificates`,
      authed(adminToken, { method: 'POST', body: JSON.stringify({ event_id: eventId }) }),
      env,
    )
    expect(issueRes.status).toBe(201)
    const issued = (await issueRes.json()) as { id: string; serial: string }
    expect(issued.serial).toMatch(/^XSIA-\d{4}-[A-Z0-9]{5}$/)

    const holderToken = await sessionTokenFor(holderId)
    const meCerts = (await (
      await app.request('/api/v1/me/certificates', authed(holderToken), env)
    ).json()) as { items: { serial: string }[] }
    expect(meCerts.items.some((i) => i.serial === issued.serial)).toBe(true)

    const verifyRes = await app.request(`/api/v1/verify/${issued.serial}`, {}, env)
    expect(verifyRes.status).toBe(200)
    const verified = (await verifyRes.json()) as { valid: boolean; holder_display_name: string }
    expect(verified.valid).toBe(true)

    const notFound = await app.request('/api/v1/verify/XSIA-2026-NOPE0', {}, env)
    expect(notFound.status).toBe(404)
    expect((await notFound.json()) as { valid: boolean }).toEqual({ valid: false })
  })

  it('issuing two certificates produces distinct serials', async () => {
    const { org, adminToken } = await setupAdmin()
    const { userId: holderId } = await createTestUser({
      email: `cert-distinct-${crypto.randomUUID()}@t.com`,
    })
    const eventId = await createEvent({ orgId: org.id })

    const first = (await (
      await app.request(
        `/api/v1/admin/users/${holderId}/certificates`,
        authed(adminToken, { method: 'POST', body: JSON.stringify({ event_id: eventId }) }),
        env,
      )
    ).json()) as { serial: string }
    const second = (await (
      await app.request(
        `/api/v1/admin/users/${holderId}/certificates`,
        authed(adminToken, { method: 'POST', body: JSON.stringify({ event_id: eventId }) }),
        env,
      )
    ).json()) as { serial: string }

    expect(first.serial).not.toBe(second.serial)
  })

  it('serial term follows the event year, not the issuance year (late back-issue)', async () => {
    const { org, adminToken } = await setupAdmin()
    const { userId: holderId } = await createTestUser({
      email: `cert-backdated-${crypto.randomUUID()}@t.com`,
    })
    // 活动发生在去年，今天（本地测试环境的真实当前年份）才补发证书
    const lastYearEventId = await createEvent({
      orgId: org.id,
      startsAt: '2025-03-01T10:00:00.000Z',
      endsAt: '2025-03-01T12:00:00.000Z',
    })

    const issued = (await (
      await app.request(
        `/api/v1/admin/users/${holderId}/certificates`,
        authed(adminToken, {
          method: 'POST',
          body: JSON.stringify({ event_id: lastYearEventId }),
        }),
        env,
      )
    ).json()) as { serial: string }

    expect(issued.serial.startsWith('XSIA-2025-')).toBe(true)
  })
})
