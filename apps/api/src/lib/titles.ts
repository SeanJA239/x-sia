import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { titleDef, user, userTitle } from '../db/schema'

export type UserTitleRow = { id: string; name: string; grantedAt: string }

/** 该用户全部已授予称号，按 granted_at 倒序。 */
export async function listUserTitles(
  db: Database,
  orgId: string,
  userId: string,
): Promise<UserTitleRow[]> {
  return db
    .select({ id: userTitle.id, name: titleDef.name, grantedAt: userTitle.grantedAt })
    .from(userTitle)
    .innerJoin(titleDef, eq(titleDef.id, userTitle.titleDefId))
    .where(and(eq(userTitle.orgId, orgId), eq(userTitle.userId, userId)))
    .orderBy(desc(userTitle.grantedAt))
}

/** 佩戴指针指向的记录若还在候选列表里就用它，否则回落到最新一条；都没有则 null。 */
export function resolveWornId(pointer: string | null, rows: UserTitleRow[]): string | null {
  if (pointer && rows.some((r) => r.id === pointer)) return pointer
  return rows[0]?.id ?? null
}

/** 卡片 / 公开页展示用：佩戴的称号名，未佩戴则最新授予，一个都没有则 null。 */
export async function getWornTitleName(
  db: Database,
  orgId: string,
  userId: string,
): Promise<string | null> {
  const [userRow, rows] = await Promise.all([
    db
      .select({ wornUserTitleId: user.wornUserTitleId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    listUserTitles(db, orgId, userId),
  ])
  const wornId = resolveWornId(userRow[0]?.wornUserTitleId ?? null, rows)
  return rows.find((r) => r.id === wornId)?.name ?? null
}
