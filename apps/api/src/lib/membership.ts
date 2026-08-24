import { and, desc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { membership, user } from '../db/schema'
import { auditLogInsert } from './audit'
import { AppError, Errors } from './errors'
import { termGrade } from './term'

export type MembershipRow = typeof membership.$inferSelect

const ACTIVATABLE_STATUSES = ['applied', 'pending_payment'] as const

function invalidTransition(action: string, from: string) {
  return new AppError(409, 'invalid_transition', `无法从「${from}」状态执行「${action}」`)
}

/**
 * member_no 分配：级*1000 + 顺序号，顺序号从 1 起，按 (org_id, 级前缀区间) 内当前最大值
 * 递增。用一条 UPDATE 语句内联子查询完成「读当前最大值 + 写入」，SQLite/D1 的写锁保证
 * 单条语句执行期间不会被其他写者插入，从而避免并发分配到重复编号。
 * WHEN member_no IS NULL 的判断保证重复调用不会覆盖已分配的编号（分配后永不变更）。
 */
function memberNoAssignExpr(orgId: string, term: string) {
  const gradeBase = termGrade(term) * 1000
  return sql`CASE WHEN ${membership.memberNo} IS NULL THEN (
    SELECT COALESCE(MAX(${membership.memberNo}), ${gradeBase}) + 1
    FROM ${membership}
    WHERE ${membership.orgId} = ${orgId}
      AND ${membership.memberNo} >= ${gradeBase}
      AND ${membership.memberNo} < ${gradeBase + 1000}
  ) ELSE ${membership.memberNo} END`
}

/**
 * 若用户已核验且已缴费，则该 membership 行原子性地转为 active 并分配 member_no。
 * verify 与 confirm-paid 都会调用这个共同的「尝试激活」步骤——两者谁后执行，谁完成
 * 最终的状态跃迁，不依赖 admin 的操作顺序。
 */
async function tryActivate(
  db: Database,
  row: MembershipRow,
  verified: boolean,
  paid: boolean,
): Promise<MembershipRow> {
  if (row.status === 'active' || !verified || !paid) return row
  const [updated] = await db
    .update(membership)
    .set({
      status: 'active',
      memberNo: memberNoAssignExpr(row.orgId, row.term),
    })
    .where(eq(membership.id, row.id))
    .returning()
  if (!updated) throw new Error('activate: membership row disappeared mid-transaction')
  return updated
}

export async function verifyMembership(
  db: Database,
  row: MembershipRow,
  actorId: string,
): Promise<MembershipRow> {
  if (!ACTIVATABLE_STATUSES.includes(row.status as (typeof ACTIVATABLE_STATUSES)[number])) {
    throw invalidTransition('verify', row.status)
  }
  const now = new Date().toISOString()
  await db.batch([
    db
      .update(user)
      .set({ emailVerifiedAt: now, verifiedBy: 'manual' })
      .where(eq(user.id, row.userId)),
    row.status === 'applied'
      ? db.update(membership).set({ status: 'pending_payment' }).where(eq(membership.id, row.id))
      : db.update(membership).set({ status: row.status }).where(eq(membership.id, row.id)),
    auditLogInsert(db, {
      orgId: row.orgId,
      actorId,
      action: 'membership.verify',
      targetType: 'membership',
      targetId: row.id,
      meta: { userId: row.userId },
    }),
  ])

  const next: MembershipRow = {
    ...row,
    status: row.status === 'applied' ? 'pending_payment' : row.status,
  }
  return tryActivate(db, next, true, row.paidConfirmedAt != null)
}

export async function confirmPaid(
  db: Database,
  row: MembershipRow,
  actorId: string,
): Promise<MembershipRow> {
  if (!ACTIVATABLE_STATUSES.includes(row.status as (typeof ACTIVATABLE_STATUSES)[number])) {
    throw invalidTransition('confirm-paid', row.status)
  }
  const now = new Date().toISOString()
  const [verifiedUser] = await db
    .select({ emailVerifiedAt: user.emailVerifiedAt })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1)

  await db.batch([
    db
      .update(membership)
      .set({ paidConfirmedAt: now, paidConfirmedBy: actorId })
      .where(eq(membership.id, row.id)),
    auditLogInsert(db, {
      orgId: row.orgId,
      actorId,
      action: 'membership.confirm_paid',
      targetType: 'membership',
      targetId: row.id,
      meta: { userId: row.userId },
    }),
  ])

  const next: MembershipRow = { ...row, paidConfirmedAt: now, paidConfirmedBy: actorId }
  return tryActivate(db, next, verifiedUser?.emailVerifiedAt != null, true)
}

export async function confirmGroup(
  db: Database,
  row: MembershipRow,
  actorId: string,
): Promise<MembershipRow> {
  const now = new Date().toISOString()
  const [[updated]] = await db.batch([
    db
      .update(membership)
      .set({ inGroupAt: now, inGroupBy: actorId })
      .where(eq(membership.id, row.id))
      .returning(),
    auditLogInsert(db, {
      orgId: row.orgId,
      actorId,
      action: 'membership.confirm_group',
      targetType: 'membership',
      targetId: row.id,
      meta: { userId: row.userId },
    }),
  ])
  if (!updated) throw new Error('confirm-group: membership row disappeared mid-transaction')
  return updated
}

export async function findMembership(
  db: Database,
  orgId: string,
  id: string,
): Promise<MembershipRow> {
  const [row] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.orgId, orgId), eq(membership.id, id)))
    .limit(1)
  if (!row) throw Errors.notFound('社员资格记录不存在')
  return row
}

/**
 * 「当前」membership：取该用户最近创建的一行。api-contract.md 未定义多届并存时
 * /me、资源门禁等场景取哪一届，这里用「最新一行」而非严格按 getCurrentTerm() 匹配，
 * 避免续费未及时发生新一届 membership 时把仍然合法的历史 active 状态判定为不可见。
 */
export async function getLatestMembership(
  db: Database,
  orgId: string,
  userId: string,
): Promise<MembershipRow | undefined> {
  const [row] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.orgId, orgId), eq(membership.userId, userId)))
    .orderBy(desc(membership.createdAt))
    .limit(1)
  return row
}
