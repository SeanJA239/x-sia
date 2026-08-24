import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { entitlement } from '../db/schema'
import { buildQuota } from '../lib/serialize'
import { requireAuth } from '../middleware/auth'
import type { AppEnv } from '../types'

export const entitlementRoutes = new Hono<AppEnv>()

entitlementRoutes.get('/entitlements', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')
  const now = new Date().toISOString()

  const [items, quota] = await Promise.all([
    db
      .select()
      .from(entitlement)
      .where(
        and(
          eq(entitlement.orgId, org.id),
          eq(entitlement.userId, currentUser.id),
          isNull(entitlement.revokedAt),
          or(isNull(entitlement.expiresAt), gt(entitlement.expiresAt, now)),
        ),
      ),
    buildQuota(db, org.id, currentUser.id),
  ])

  return c.json({
    items: items.map((e) => ({
      kind: e.kind,
      tier: e.tier,
      granted_at: e.grantedAt,
      expires_at: e.expiresAt,
    })),
    quota,
  })
})
