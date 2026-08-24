import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'
import { generateCheckinToken, isEventActiveNow, verifyCheckinToken } from '../src/lib/checkin'
import { createEvent, createTestUser, grantAdmin, sessionTokenFor } from './helpers'

describe('checkin token', () => {
  it('accepts a token from the current window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { token } = await generateCheckinToken('secret-a', 'event-a')
    const result = await verifyCheckinToken('secret-a', token)
    expect(result).toEqual({ ok: true, eventId: 'event-a' })
    vi.useRealTimers()
  })

  it('tolerates a token from the previous window (grace period)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { token } = await generateCheckinToken('secret-a', 'event-a')

    vi.setSystemTime(new Date('2026-01-01T00:00:31.000Z')) // 跨过 30 秒窗口边界
    const result = await verifyCheckinToken('secret-a', token)
    expect(result).toEqual({ ok: true, eventId: 'event-a' })
    vi.useRealTimers()
  })

  it('rejects a token older than the previous window as token_expired', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { token } = await generateCheckinToken('secret-a', 'event-a')

    vi.setSystemTime(new Date('2026-01-01T00:01:01.000Z')) // 两个窗口以前
    const result = await verifyCheckinToken('secret-a', token)
    expect(result).toEqual({ ok: false, error: 'token_expired' })
    vi.useRealTimers()
  })

  it('rejects a tampered signature as invalid_token', async () => {
    const { token } = await generateCheckinToken('secret-a', 'event-a')
    const tampered = token.slice(0, -1) + (token.at(-1) === '0' ? '1' : '0')
    const result = await verifyCheckinToken('secret-a', tampered)
    expect(result).toEqual({ ok: false, error: 'invalid_token' })
  })

  it('rejects a malformed token as invalid_token', async () => {
    expect(await verifyCheckinToken('secret-a', 'not-a-token')).toEqual({
      ok: false,
      error: 'invalid_token',
    })
    expect(await verifyCheckinToken('secret-a', 'e.event-a.123')).toEqual({
      ok: false,
      error: 'invalid_token',
    })
  })

  it('prevents cross-event replay: a token cannot be verified against a different event secret', async () => {
    const { token: tokenForEventA } = await generateCheckinToken('secret-a', 'event-a')
    // 伪造成指向 event-b 的 token（换掉 event_id 段，保留 event-a 的签名段）
    const forged = tokenForEventA.replace('event-a', 'event-b')
    const result = await verifyCheckinToken('secret-b', forged)
    expect(result).toEqual({ ok: false, error: 'invalid_token' })
  })

  it('isEventActiveNow: true inside range and inside the 30-minute grace, false beyond it', () => {
    const now = Date.now()
    const startsAt = new Date(now - 60 * 60 * 1000).toISOString() // 1 小时前开始
    const endsAt = new Date(now + 60 * 60 * 1000).toISOString() // 1 小时后结束
    expect(isEventActiveNow(startsAt, endsAt)).toBe(true)

    const future = new Date(now + 2 * 60 * 60 * 1000).toISOString()
    const farFuture = new Date(now + 3 * 60 * 60 * 1000).toISOString()
    expect(isEventActiveNow(future, farFuture)).toBe(false)

    const almostStarting = new Date(now + 20 * 60 * 1000).toISOString() // 20 分钟后开始，在 30 分钟宽限内
    expect(isEventActiveNow(almostStarting, farFuture)).toBe(true)
  })
})

async function chat(path: string, token: string, body?: unknown) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    env,
  )
}

describe('checkin end to end', () => {
  it('rejects a non-active member with 403', async () => {
    const { org, userId } = await createTestUser({
      email: `checkin-inactive-${crypto.randomUUID()}@t.com`,
      status: 'applied',
    })
    const eventId = await createEvent({ orgId: org.id })
    const token = await sessionTokenFor(userId)

    const res = await chat('/api/v1/checkin', token, {
      token: `e.${eventId}.0.${'0'.repeat(32)}`,
    })
    expect(res.status).toBe(403)
  })

  it('active member checks in successfully, duplicate check-in is rejected, and stats update', async () => {
    const { org, userId } = await createTestUser({
      email: `checkin-active-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const secret = 'e2e-secret'
    const eventId = await createEvent({ orgId: org.id, checkinSecret: secret })
    const memberToken = await sessionTokenFor(userId)

    // 走真实的 screen-token 端点拿 token，需要一个 admin 身份
    const { userId: adminId } = await createTestUser({
      email: `checkin-admin-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    await grantAdmin(org.id, adminId)
    const adminToken = await sessionTokenFor(adminId)

    const screenRes = await app.request(
      `/api/v1/admin/events/${eventId}/screen-token`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
      env,
    )
    expect(screenRes.status).toBe(200)
    const { token: checkinToken } = (await screenRes.json()) as { token: string }

    const checkinRes = await chat('/api/v1/checkin', memberToken, { token: checkinToken })
    expect(checkinRes.status).toBe(200)
    const { checked_in_at: firstCheckedInAt } = (await checkinRes.json()) as {
      checked_in_at: string
    }

    const dupRes = await chat('/api/v1/checkin', memberToken, { token: checkinToken })
    expect(dupRes.status).toBe(409)
    expect(
      (await dupRes.json()) as { error: { code: string; details: { checked_in_at: string } } },
    ).toMatchObject({
      error: { code: 'already_checked_in', details: { checked_in_at: firstCheckedInAt } },
    })

    const attendanceRes = await app.request(
      '/api/v1/me/attendance',
      { headers: { Authorization: `Bearer ${memberToken}` } },
      env,
    )
    const attendance = (await attendanceRes.json()) as { items: { method: string }[] }
    expect(attendance.items).toHaveLength(1)
    expect(attendance.items[0]?.method).toBe('qr')

    const cardRes = await app.request(
      '/api/v1/card',
      { headers: { Authorization: `Bearer ${memberToken}` } },
      env,
    )
    const card = (await cardRes.json()) as { stats: { attendance_count: number } }
    expect(card.stats.attendance_count).toBe(1)
  })

  it('rejects check-in outside the event time range with event_not_active', async () => {
    const { org, userId } = await createTestUser({
      email: `checkin-outside-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const secret = 'outside-secret'
    const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const eventId = await createEvent({
      orgId: org.id,
      checkinSecret: secret,
      startsAt: farFuture.toISOString(),
      endsAt: new Date(farFuture.getTime() + 60 * 60 * 1000).toISOString(),
    })
    const memberToken = await sessionTokenFor(userId)

    const { token: checkinToken } = await generateCheckinToken(secret, eventId)

    const res = await chat('/api/v1/checkin', memberToken, { token: checkinToken })
    expect(res.status).toBe(403)
    expect((await res.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'event_not_active' },
    })
  })

  it('admin can manually back-fill attendance, duplicate back-fill is rejected', async () => {
    const { org, userId: adminId } = await createTestUser({
      email: `manual-admin-${crypto.randomUUID()}@t.com`,
    })
    await grantAdmin(org.id, adminId)
    const adminToken = await sessionTokenFor(adminId)

    const { userId: targetId } = await createTestUser({
      email: `manual-target-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    const eventId = await createEvent({ orgId: org.id })

    const res = await chat(`/api/v1/admin/events/${eventId}/attendance`, adminToken, {
      user_id: targetId,
    })
    expect(res.status).toBe(201)

    const dup = await chat(`/api/v1/admin/events/${eventId}/attendance`, adminToken, {
      user_id: targetId,
    })
    expect(dup.status).toBe(409)

    const listRes = await app.request(
      `/api/v1/admin/events/${eventId}/attendance`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
      env,
    )
    const list = (await listRes.json()) as { items: { method: string; user: { id: string } }[] }
    expect(list.items.some((i) => i.user.id === targetId && i.method === 'manual')).toBe(true)
  })

  it('rejects manual back-fill for a non-active member with 403 member_not_active', async () => {
    const { org, userId: adminId } = await createTestUser({
      email: `manual-inactive-admin-${crypto.randomUUID()}@t.com`,
    })
    await grantAdmin(org.id, adminId)
    const adminToken = await sessionTokenFor(adminId)

    const { userId: targetId } = await createTestUser({
      email: `manual-inactive-target-${crypto.randomUUID()}@t.com`,
      status: 'applied',
    })
    const eventId = await createEvent({ orgId: org.id })

    const res = await chat(`/api/v1/admin/events/${eventId}/attendance`, adminToken, {
      user_id: targetId,
    })
    expect(res.status).toBe(403)
    expect((await res.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'member_not_active' },
    })
  })

  it('GET /admin/events/:id returns the same shape as the create response', async () => {
    const { org, userId: adminId } = await createTestUser({
      email: `event-detail-admin-${crypto.randomUUID()}@t.com`,
    })
    await grantAdmin(org.id, adminId)
    const adminToken = await sessionTokenFor(adminId)

    const createRes = await chat('/api/v1/admin/events', adminToken, {
      title: '详情测试活动',
      starts_at: '2026-01-01T10:00:00.000Z',
      ends_at: '2026-01-01T12:00:00.000Z',
      location: '测试地点',
    })
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as { id: string }

    const detailRes = await app.request(
      `/api/v1/admin/events/${created.id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
      env,
    )
    expect(detailRes.status).toBe(200)
    const detail = await detailRes.json()
    expect(detail).toEqual(created)
  })
})
