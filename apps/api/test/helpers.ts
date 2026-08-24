import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { createDb } from '../src/db/client'
import { entitlement, event, membership, org, user } from '../src/db/schema'
import { hashPassword } from '../src/lib/crypto'
import { newId } from '../src/lib/id'
import { createSession } from '../src/lib/session'

export function db() {
  return createDb(env.DB)
}

/** 幂等：多个测试共用同一存储时不会因为 slug 唯一约束报错。 */
export async function getOrCreateOrg() {
  const database = db()
  const [existing] = await database.select().from(org).where(eq(org.slug, 'x-sia')).limit(1)
  if (existing) return existing

  const row = {
    id: newId(),
    slug: 'x-sia',
    name: 'X-SIA',
    emailDomains: '[]',
    createdAt: new Date().toISOString(),
  }
  await database.insert(org).values(row)
  return row
}

export async function createTestUser(opts: {
  email: string
  password?: string
  term?: string
  status?: 'applied' | 'pending_payment' | 'active' | 'expired' | 'revoked'
}) {
  const database = db()
  const orgRow = await getOrCreateOrg()
  const now = new Date().toISOString()
  const userId = newId()

  await database.insert(user).values({
    id: userId,
    email: opts.email,
    passwordHash: await hashPassword(opts.password ?? 'password123'),
    displayName: opts.email,
    createdAt: now,
  })

  const membershipId = newId()
  await database.insert(membership).values({
    id: membershipId,
    orgId: orgRow.id,
    userId,
    term: opts.term ?? '2026',
    status: opts.status ?? 'applied',
    createdAt: now,
  })

  return { org: orgRow, userId, membershipId }
}

export async function grantAdmin(orgId: string, userId: string) {
  const database = db()
  await database.insert(entitlement).values({
    id: newId(),
    orgId,
    userId,
    kind: 'admin',
    tier: null,
    grantedAt: new Date().toISOString(),
    expiresAt: null,
    revokedAt: null,
  })
}

export async function sessionTokenFor(userId: string) {
  return createSession(db(), userId)
}

export async function createEvent(opts: {
  orgId: string
  checkinSecret?: string
  startsAt?: string
  endsAt?: string
}) {
  const database = db()
  const now = new Date()
  const id = newId()
  await database.insert(event).values({
    id,
    orgId: opts.orgId,
    title: `测试活动 ${id}`,
    startsAt: opts.startsAt ?? new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    endsAt: opts.endsAt ?? new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    location: null,
    checkinSecret: opts.checkinSecret ?? 'test-checkin-secret',
    lumaId: null,
    createdAt: now.toISOString(),
  })
  return id
}
