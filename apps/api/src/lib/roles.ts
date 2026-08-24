import { and, eq, gt, isNull, or } from 'drizzle-orm'
import type { Database } from '../db/client'
import { entitlement } from '../db/schema'

/**
 * 角色实时推导，不固化进 session：admin = 存在一条未撤销（revoked_at 为空）且未过期
 * 的 kind='admin' entitlement。撤权立即生效，不必等 session 过期。
 */
export async function isAdmin(db: Database, orgId: string, userId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const rows = await db
    .select({ id: entitlement.id })
    .from(entitlement)
    .where(
      and(
        eq(entitlement.orgId, orgId),
        eq(entitlement.userId, userId),
        eq(entitlement.kind, 'admin'),
        isNull(entitlement.revokedAt),
        or(isNull(entitlement.expiresAt), gt(entitlement.expiresAt, now)),
      ),
    )
    .limit(1)
  return rows.length > 0
}
