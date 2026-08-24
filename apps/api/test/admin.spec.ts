import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import app from '../src/index'
import { createTestUser, grantAdmin, sessionTokenFor } from './helpers'

describe('admin routes', () => {
  it('rejects a non-admin member with 403', async () => {
    const { userId } = await createTestUser({ email: `nonadmin-${crypto.randomUUID()}@t.com` })
    const token = await sessionTokenFor(userId)

    const res = await app.request(
      '/api/v1/admin/members',
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    )
    expect(res.status).toBe(403)
  })

  it('lets an admin verify + confirm-paid a member and records audit_log', async () => {
    const { org, userId: adminId } = await createTestUser({
      email: `admin-${crypto.randomUUID()}@t.com`,
    })
    await grantAdmin(org.id, adminId)
    const adminToken = await sessionTokenFor(adminId)

    const term = `19${Math.floor(Math.random() * 90 + 10)}`
    const { membershipId } = await createTestUser({
      email: `target-${crypto.randomUUID()}@t.com`,
      term,
    })

    const verifyRes = await app.request(
      `/api/v1/admin/members/${membershipId}/verify`,
      { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } },
      env,
    )
    expect(verifyRes.status).toBe(200)
    expect(((await verifyRes.json()) as { membership: { status: string } }).membership.status).toBe(
      'pending_payment',
    )

    const confirmRes = await app.request(
      `/api/v1/admin/members/${membershipId}/confirm-paid`,
      { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } },
      env,
    )
    expect(confirmRes.status).toBe(200)
    const confirmed = (await confirmRes.json()) as {
      membership: { status: string; member_no: number }
    }
    expect(confirmed.membership.status).toBe('active')
    expect(confirmed.membership.member_no).toBeGreaterThan(0)

    const auditRes = await app.request(
      '/api/v1/admin/audit',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      env,
    )
    expect(auditRes.status).toBe(200)
    const audit = (await auditRes.json()) as { items: { action: string; target_id: string }[] }
    const actions = audit.items.filter((i) => i.target_id === membershipId).map((i) => i.action)
    expect(actions).toContain('membership.verify')
    expect(actions).toContain('membership.confirm_paid')
  })
})
