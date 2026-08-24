import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { titleDef, userTitle } from '../db/schema'

/**
 * 「佩戴」的称号：优先取 is_worn=true 的一条，否则按 decisions.md 的约定
 * 默认取 granted_at 最新的一条；都没有则返回 null。
 */
export async function getWornTitleName(
  db: Database,
  orgId: string,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ name: titleDef.name, isWorn: userTitle.isWorn, grantedAt: userTitle.grantedAt })
    .from(userTitle)
    .innerJoin(titleDef, eq(titleDef.id, userTitle.titleDefId))
    .where(and(eq(userTitle.orgId, orgId), eq(userTitle.userId, userId)))
    .orderBy(desc(userTitle.grantedAt))

  return rows.find((r) => r.isWorn)?.name ?? rows[0]?.name ?? null
}
