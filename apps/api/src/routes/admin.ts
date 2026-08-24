import { and, desc, eq, like, lt, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { auditLog, membership, user } from '../db/schema'
import { confirmGroup, confirmPaid, findMembership, verifyMembership } from '../lib/membership'
import { decodeCursor, encodeCursor } from '../lib/pagination'
import { serializeMembership } from '../lib/serialize'
import { requireAdmin, requireAuth } from '../middleware/auth'
import type { AuthedEnv } from '../types'

export const adminRoutes = new Hono<AuthedEnv>()

adminRoutes.use('/admin/*', requireAuth, requireAdmin)

adminRoutes.get('/admin/members', async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const term = c.req.query('term')
  const q = c.req.query('q')

  const conditions = [eq(membership.orgId, org.id)]
  if (term) conditions.push(eq(membership.term, term))
  if (q) {
    const like_ = `%${q}%`
    const qCondition = or(like(user.email, like_), like(user.displayName, like_))
    if (qCondition) conditions.push(qCondition)
  }

  const rows = await db
    .select({
      id: membership.id,
      term: membership.term,
      status: membership.status,
      memberNo: membership.memberNo,
      paidConfirmedAt: membership.paidConfirmedAt,
      inGroupAt: membership.inGroupAt,
      createdAt: membership.createdAt,
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(...conditions))
    .orderBy(desc(membership.createdAt))

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      term: r.term,
      status: r.status,
      member_no: r.memberNo,
      paid_confirmed_at: r.paidConfirmedAt,
      in_group_at: r.inGroupAt,
      created_at: r.createdAt,
      user: { id: r.userId, email: r.email, display_name: r.displayName },
    })),
  })
})

adminRoutes.post('/admin/members/:mid/verify', async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const row = await findMembership(db, org.id, c.req.param('mid'))
  const updated = await verifyMembership(db, row, c.get('user').id)
  return c.json({ membership: serializeMembership(updated) })
})

adminRoutes.post('/admin/members/:mid/confirm-paid', async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const row = await findMembership(db, org.id, c.req.param('mid'))
  const updated = await confirmPaid(db, row, c.get('user').id)
  return c.json({ membership: serializeMembership(updated) })
})

adminRoutes.post('/admin/members/:mid/confirm-group', async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const row = await findMembership(db, org.id, c.req.param('mid'))
  const updated = await confirmGroup(db, row, c.get('user').id)
  return c.json({ membership: serializeMembership(updated) })
})

const PAGE_SIZE = 50

adminRoutes.get('/admin/audit', async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const cursor = decodeCursor(c.req.query('cursor'))

  const conditions = [eq(auditLog.orgId, org.id)]
  if (cursor) {
    conditions.push(
      or(
        lt(auditLog.createdAt, cursor.createdAt),
        and(eq(auditLog.createdAt, cursor.createdAt), lt(auditLog.id, cursor.id)),
      ) ?? eq(auditLog.orgId, org.id),
    )
  }

  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(PAGE_SIZE + 1)

  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const last = page.at(-1)

  return c.json({
    items: page.map((r) => ({
      id: r.id,
      actor_id: r.actorId,
      action: r.action,
      target_type: r.targetType,
      target_id: r.targetId,
      meta: r.meta ? JSON.parse(r.meta) : null,
      created_at: r.createdAt,
    })),
    next_cursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  })
})
