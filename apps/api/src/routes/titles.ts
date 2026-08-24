import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { certificate, event, titleDef, user, userTitle } from '../db/schema'
import { auditLogInsert } from '../lib/audit'
import { generateCertSerial } from '../lib/cert'
import { AppError, Errors } from '../lib/errors'
import { newId } from '../lib/id'
import { getCurrentTerm } from '../lib/term'
import { listUserTitles, resolveWornId } from '../lib/titles'
import { requireAdmin, requireAuth } from '../middleware/auth'
import type { AuthedEnv } from '../types'

export const titleRoutes = new Hono<AuthedEnv>()

titleRoutes.get('/titles', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const rows = await db
    .select({ id: titleDef.id, name: titleDef.name })
    .from(titleDef)
    .where(eq(titleDef.orgId, org.id))
  return c.json({ items: rows })
})

const titleDefCreateSchema = z.object({ name: z.string().min(1).max(50) })

titleRoutes.post('/admin/titles', requireAuth, requireAdmin, async (c) => {
  const parsed = titleDefCreateSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const id = newId()
  await db.insert(titleDef).values({ id, orgId: org.id, name: parsed.data.name, ruleJson: null })
  return c.json({ id, name: parsed.data.name }, 201)
})

const grantTitleSchema = z.object({ title_def_id: z.string().min(1) })

titleRoutes.post('/admin/users/:uid/titles', requireAuth, requireAdmin, async (c) => {
  const parsed = grantTitleSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')
  const targetUserId = c.req.param('uid')

  const [def] = await db
    .select({ id: titleDef.id, name: titleDef.name })
    .from(titleDef)
    .where(and(eq(titleDef.orgId, org.id), eq(titleDef.id, parsed.data.title_def_id)))
    .limit(1)
  if (!def) throw Errors.notFound('称号定义不存在')

  const now = new Date().toISOString()
  const id = newId()
  await db.insert(userTitle).values({
    id,
    orgId: org.id,
    userId: targetUserId,
    titleDefId: def.id,
    grantedAt: now,
  })
  await auditLogInsert(db, {
    orgId: org.id,
    actorId: currentUser.id,
    action: 'title.grant',
    targetType: 'user',
    targetId: targetUserId,
    meta: { titleDefId: def.id },
  })

  const [userRow] = await db
    .select({ wornUserTitleId: user.wornUserTitleId })
    .from(user)
    .where(eq(user.id, targetUserId))
    .limit(1)
  const rows = await listUserTitles(db, org.id, targetUserId)
  const wornId = resolveWornId(userRow?.wornUserTitleId ?? null, rows)

  return c.json({ id, name: def.name, granted_at: now, worn: id === wornId }, 201)
})

titleRoutes.get('/me/titles', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const rows = await listUserTitles(db, org.id, currentUser.id)
  const wornId = resolveWornId(currentUser.wornUserTitleId, rows)

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      granted_at: r.grantedAt,
      worn: r.id === wornId,
    })),
  })
})

const wornTitleSchema = z.object({ user_title_id: z.string().min(1).nullable() })

titleRoutes.put('/me/worn-title', requireAuth, async (c) => {
  const parsed = wornTitleSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  if (parsed.data.user_title_id) {
    const [owned] = await db
      .select({ id: userTitle.id })
      .from(userTitle)
      .where(
        and(
          eq(userTitle.orgId, org.id),
          eq(userTitle.userId, currentUser.id),
          eq(userTitle.id, parsed.data.user_title_id),
        ),
      )
      .limit(1)
    if (!owned) throw Errors.notFound('该称号不属于你')
  }

  await db
    .update(user)
    .set({ wornUserTitleId: parsed.data.user_title_id })
    .where(eq(user.id, currentUser.id))

  return c.json({ worn_user_title_id: parsed.data.user_title_id })
})

const certCreateSchema = z.object({ event_id: z.string().min(1) })
const MAX_SERIAL_ATTEMPTS = 5

titleRoutes.post('/admin/users/:uid/certificates', requireAuth, requireAdmin, async (c) => {
  const parsed = certCreateSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')
  const targetUserId = c.req.param('uid')

  const [eventRow] = await db
    .select({ id: event.id })
    .from(event)
    .where(and(eq(event.orgId, org.id), eq(event.id, parsed.data.event_id)))
    .limit(1)
  if (!eventRow) throw Errors.notFound('活动不存在')

  const term = getCurrentTerm()
  const id = newId()
  const now = new Date().toISOString()

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_SERIAL_ATTEMPTS; attempt++) {
    const serial = generateCertSerial(term)
    try {
      await db.insert(certificate).values({
        id,
        orgId: org.id,
        userId: targetUserId,
        eventId: eventRow.id,
        serial,
        issuedAt: now,
      })
      await auditLogInsert(db, {
        orgId: org.id,
        actorId: currentUser.id,
        action: 'certificate.issue',
        targetType: 'user',
        targetId: targetUserId,
        meta: { eventId: eventRow.id, serial },
      })
      return c.json({ id, serial }, 201)
    } catch (err) {
      // serial 冲突概率极低（36^5 组合），撞了就换一个重试；其他错误直接抛出。
      lastError = err
    }
  }
  throw lastError
})

titleRoutes.get('/me/certificates', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const rows = await db
    .select({
      id: certificate.id,
      serial: certificate.serial,
      eventId: event.id,
      eventTitle: event.title,
      issuedAt: certificate.issuedAt,
    })
    .from(certificate)
    .innerJoin(event, eq(event.id, certificate.eventId))
    .where(and(eq(certificate.orgId, org.id), eq(certificate.userId, currentUser.id)))
    .orderBy(desc(certificate.issuedAt))

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      serial: r.serial,
      event: { id: r.eventId, title: r.eventTitle },
      issued_at: r.issuedAt,
    })),
  })
})

// 公开路由：证书验证不需要登录，也不套 {error:{code,message}} 信封——
// 找不到时用 404 状态码本身表达 valid:false，契约里明确写了这个特例。
titleRoutes.get('/verify/:serial', async (c) => {
  const db = c.get('db')
  const org = c.get('org')

  const [row] = await db
    .select({
      displayName: user.displayName,
      eventTitle: event.title,
      issuedAt: certificate.issuedAt,
    })
    .from(certificate)
    .innerJoin(user, eq(user.id, certificate.userId))
    .innerJoin(event, eq(event.id, certificate.eventId))
    .where(and(eq(certificate.orgId, org.id), eq(certificate.serial, c.req.param('serial'))))
    .limit(1)

  if (!row) return c.json({ valid: false }, 404)

  return c.json({
    valid: true,
    holder_display_name: row.displayName,
    event_title: row.eventTitle,
    issued_at: row.issuedAt,
  })
})
