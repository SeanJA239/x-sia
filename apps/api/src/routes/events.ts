import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { attendance, event, user } from '../db/schema'
import { auditLogInsert } from '../lib/audit'
import {
  extractEventId,
  generateCheckinToken,
  isEventActiveNow,
  verifyCheckinToken,
} from '../lib/checkin'
import { AppError, Errors } from '../lib/errors'
import { newId } from '../lib/id'
import { getLatestMembership } from '../lib/membership'
import { requireAdmin, requireAuth } from '../middleware/auth'
import type { AuthedEnv } from '../types'

function isValidIsoDate(v: string): boolean {
  return !Number.isNaN(Date.parse(v))
}

const eventFieldsSchema = z.object({
  title: z.string().min(1).max(200),
  starts_at: z.string().refine(isValidIsoDate, '不是合法的 ISO 时间'),
  ends_at: z.string().refine(isValidIsoDate, '不是合法的 ISO 时间'),
  location: z.string().max(200).optional(),
  luma_id: z.string().max(200).optional(),
})

function serializeEvent(row: typeof event.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    starts_at: row.startsAt,
    ends_at: row.endsAt,
    location: row.location,
    luma_id: row.lumaId,
    created_at: row.createdAt,
  }
}

async function loadEvent(db: Database, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(event)
    .where(and(eq(event.orgId, orgId), eq(event.id, id)))
    .limit(1)
  if (!row) throw Errors.notFound('活动不存在')
  return row
}

export const eventRoutes = new Hono<AuthedEnv>()

eventRoutes.get('/events', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const rows = await db
    .select({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      lumaId: event.lumaId,
      attendanceId: attendance.id,
    })
    .from(event)
    .leftJoin(
      attendance,
      and(eq(attendance.eventId, event.id), eq(attendance.userId, currentUser.id)),
    )
    .where(eq(event.orgId, org.id))
    .orderBy(desc(event.startsAt))

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      starts_at: r.startsAt,
      ends_at: r.endsAt,
      location: r.location,
      luma_id: r.lumaId,
      checked_in: r.attendanceId != null,
    })),
  })
})

eventRoutes.post('/admin/events', requireAuth, requireAdmin, async (c) => {
  const parsed = eventFieldsSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const now = new Date().toISOString()
  const id = newId()

  await db.insert(event).values({
    id,
    orgId: org.id,
    title: parsed.data.title,
    startsAt: parsed.data.starts_at,
    endsAt: parsed.data.ends_at,
    location: parsed.data.location ?? null,
    lumaId: parsed.data.luma_id ?? null,
    // 建活动时随机生成，任何端点都不下发。
    checkinSecret: crypto.randomUUID() + crypto.randomUUID(),
    createdAt: now,
  })

  const row = await loadEvent(db, org.id, id)
  return c.json(serializeEvent(row), 201)
})

eventRoutes.patch('/admin/events/:id', requireAuth, requireAdmin, async (c) => {
  const parsed = eventFieldsSchema.partial().safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const existing = await loadEvent(db, org.id, c.req.param('id'))

  await db
    .update(event)
    .set({
      title: parsed.data.title ?? existing.title,
      startsAt: parsed.data.starts_at ?? existing.startsAt,
      endsAt: parsed.data.ends_at ?? existing.endsAt,
      location: parsed.data.location ?? existing.location,
      lumaId: parsed.data.luma_id ?? existing.lumaId,
    })
    .where(eq(event.id, existing.id))

  const updated = await loadEvent(db, org.id, existing.id)
  return c.json(serializeEvent(updated))
})

eventRoutes.get('/admin/events/:id/screen-token', requireAuth, requireAdmin, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const row = await loadEvent(db, org.id, c.req.param('id'))
  const { token, expiresAt } = await generateCheckinToken(row.checkinSecret, row.id)
  return c.json({ token, expires_at: expiresAt })
})

eventRoutes.get('/admin/events/:id/attendance', requireAuth, requireAdmin, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const eventRow = await loadEvent(db, org.id, c.req.param('id'))

  const rows = await db
    .select({
      userId: user.id,
      displayName: user.displayName,
      checkedInAt: attendance.checkedInAt,
      method: attendance.method,
    })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(eq(attendance.eventId, eventRow.id))
    .orderBy(desc(attendance.checkedInAt))

  const items = await Promise.all(
    rows.map(async (r) => {
      const membershipRow = await getLatestMembership(db, org.id, r.userId)
      return {
        user: { id: r.userId, display_name: r.displayName },
        member_no: membershipRow?.memberNo ?? null,
        checked_in_at: r.checkedInAt,
        method: r.method,
      }
    }),
  )

  return c.json({ items })
})

const manualAttendanceSchema = z.object({ user_id: z.string().min(1) })

eventRoutes.post('/admin/events/:id/attendance', requireAuth, requireAdmin, async (c) => {
  const parsed = manualAttendanceSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')
  const eventRow = await loadEvent(db, org.id, c.req.param('id'))

  const [existing] = await db
    .select({ id: attendance.id })
    .from(attendance)
    .where(and(eq(attendance.eventId, eventRow.id), eq(attendance.userId, parsed.data.user_id)))
    .limit(1)
  if (existing) throw Errors.conflict('already_checked_in', '该成员已签到')

  const now = new Date().toISOString()
  await db.insert(attendance).values({
    id: newId(),
    orgId: org.id,
    eventId: eventRow.id,
    userId: parsed.data.user_id,
    checkedInAt: now,
    method: 'manual',
  })
  await auditLogInsert(db, {
    orgId: org.id,
    actorId: currentUser.id,
    action: 'attendance.manual_checkin',
    targetType: 'event',
    targetId: eventRow.id,
    meta: { userId: parsed.data.user_id },
  })

  return c.json({ checked_in_at: now, method: 'manual' }, 201)
})

const checkinSchema = z.object({ token: z.string().min(1) })

eventRoutes.post('/checkin', requireAuth, async (c) => {
  const parsed = checkinSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const membershipRow = await getLatestMembership(db, org.id, currentUser.id)
  if (membershipRow?.status !== 'active') throw Errors.forbidden('仅 active 社员可签到')

  const eventId = extractEventId(parsed.data.token)
  if (!eventId) throw new AppError(400, 'invalid_token', '签到码格式不合法')

  const eventRow = await loadEvent(db, org.id, eventId)
  const verified = await verifyCheckinToken(eventRow.checkinSecret, parsed.data.token)
  if (!verified.ok) {
    throw new AppError(
      400,
      verified.error,
      verified.error === 'invalid_token' ? '签到码无效' : '签到码已过期',
    )
  }

  if (!isEventActiveNow(eventRow.startsAt, eventRow.endsAt)) {
    throw new AppError(403, 'event_not_active', '不在活动签到时间范围内')
  }

  const [existing] = await db
    .select({ id: attendance.id })
    .from(attendance)
    .where(and(eq(attendance.eventId, eventRow.id), eq(attendance.userId, currentUser.id)))
    .limit(1)
  if (existing) throw Errors.conflict('already_checked_in', '你已经签到过了')

  const now = new Date().toISOString()
  await db.insert(attendance).values({
    id: newId(),
    orgId: org.id,
    eventId: eventRow.id,
    userId: currentUser.id,
    checkedInAt: now,
    method: 'qr',
  })

  return c.json({ event: { id: eventRow.id, title: eventRow.title }, checked_in_at: now })
})

eventRoutes.get('/me/attendance', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const rows = await db
    .select({
      eventId: event.id,
      title: event.title,
      startsAt: event.startsAt,
      checkedInAt: attendance.checkedInAt,
      method: attendance.method,
    })
    .from(attendance)
    .innerJoin(event, eq(event.id, attendance.eventId))
    .where(and(eq(attendance.orgId, org.id), eq(attendance.userId, currentUser.id)))
    .orderBy(desc(attendance.checkedInAt))

  return c.json({
    items: rows.map((r) => ({
      event: { id: r.eventId, title: r.title, starts_at: r.startsAt },
      checked_in_at: r.checkedInAt,
      method: r.method,
    })),
  })
})
