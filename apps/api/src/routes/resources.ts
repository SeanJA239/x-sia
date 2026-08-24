import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { resource, user } from '../db/schema'
import { auditLogInsert } from '../lib/audit'
import { AppError, Errors } from '../lib/errors'
import { newId } from '../lib/id'
import { getLatestMembership } from '../lib/membership'
import { signResourceUrl, verifyResourceUrl } from '../lib/resource-sign'
import { isAdmin } from '../lib/roles'
import { requireAuth } from '../middleware/auth'
import type { AppEnv } from '../types'

export const resourceRoutes = new Hono<AppEnv>()

function safeFilename(name: string): string {
  const trimmed = name.trim().slice(-150)
  return trimmed.replace(/[^\w.\-一-鿿]/g, '_') || 'file'
}

resourceRoutes.get('/resources', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const membershipRow = await getLatestMembership(db, org.id, currentUser.id)
  const active = membershipRow?.status === 'active'

  const visibilityFilter = active
    ? or(eq(resource.visibility, 'member'), eq(resource.visibility, 'public'))
    : eq(resource.visibility, 'public')

  const rows = await db
    .select()
    .from(resource)
    .where(and(eq(resource.orgId, org.id), visibilityFilter))
    .orderBy(desc(resource.createdAt))

  const uploaderIds = [...new Set(rows.map((r) => r.uploaderId))]
  const uploaders = new Map<string, { id: string; display_name: string }>()
  if (uploaderIds.length > 0) {
    const users = await db.select().from(user).where(inArray(user.id, uploaderIds))
    for (const u of users) uploaders.set(u.id, { id: u.id, display_name: u.displayName })
  }

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      size: r.size,
      mime: r.mime,
      visibility: r.visibility,
      uploader: uploaders.get(r.uploaderId) ?? { id: r.uploaderId, display_name: '' },
      created_at: r.createdAt,
    })),
  })
})

const uploadSchema = z.object({
  title: z.string().min(1).max(200),
  visibility: z.enum(['member', 'public']),
})

resourceRoutes.post('/resources', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const membershipRow = await getLatestMembership(db, org.id, currentUser.id)
  if (membershipRow?.status !== 'active') throw Errors.forbidden('仅 active 社员可上传资源')

  const body = await c.req.parseBody()
  const file = body.file
  if (!(file instanceof File)) throw new AppError(400, 'bad_request', '缺少 file 字段')

  const parsed = uploadSchema.safeParse({ title: body.title, visibility: body.visibility })
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const id = newId()
  const r2Key = `res/${id}/${safeFilename(file.name)}`
  await c.env.BUCKET.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  })

  const now = new Date().toISOString()
  await db.insert(resource).values({
    id,
    orgId: org.id,
    uploaderId: currentUser.id,
    title: parsed.data.title,
    r2Key,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    visibility: parsed.data.visibility,
    createdAt: now,
  })

  return c.json(
    {
      id,
      title: parsed.data.title,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      visibility: parsed.data.visibility,
      uploader: { id: currentUser.id, display_name: currentUser.displayName },
      created_at: now,
    },
    201,
  )
})

async function loadResourceForAccess(db: Database, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(resource)
    .where(and(eq(resource.orgId, orgId), eq(resource.id, id)))
    .limit(1)
  if (!row) throw Errors.notFound('资源不存在')
  return row
}

resourceRoutes.get('/resources/:id/download', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')
  const row = await loadResourceForAccess(db, org.id, c.req.param('id'))

  if (row.visibility === 'member') {
    const membershipRow = await getLatestMembership(db, org.id, currentUser.id)
    if (membershipRow?.status !== 'active') throw Errors.forbidden('该资源仅 active 社员可下载')
  }

  const { exp, sig } = await signResourceUrl(c.env.SIGN_SECRET, row.id)
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/\/download$/, '/file')
  url.search = `?exp=${exp}&sig=${sig}`
  return c.json({ url: url.toString() })
})

resourceRoutes.get('/resources/:id/file', async (c) => {
  const id = c.req.param('id')
  const exp = Number.parseInt(c.req.query('exp') ?? '', 10)
  const sig = c.req.query('sig') ?? ''
  if (!(await verifyResourceUrl(c.env.SIGN_SECRET, id, exp, sig))) {
    throw Errors.forbidden('签名无效或已过期')
  }

  const db = c.get('db')
  const org = c.get('org')
  const row = await loadResourceForAccess(db, org.id, id)
  const object = await c.env.BUCKET.get(row.r2Key)
  if (!object) throw Errors.notFound('文件不存在')

  return new Response(object.body, {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(row.size),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(row.title)}"`,
    },
  })
})

resourceRoutes.delete('/resources/:id', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')
  const row = await loadResourceForAccess(db, org.id, c.req.param('id'))

  const admin = await isAdmin(db, org.id, currentUser.id)
  if (row.uploaderId !== currentUser.id && !admin) {
    throw Errors.forbidden('只有上传者本人或 admin 可以下架该资源')
  }

  await c.env.BUCKET.delete(row.r2Key)
  await db.delete(resource).where(eq(resource.id, row.id))
  await auditLogInsert(db, {
    orgId: org.id,
    actorId: currentUser.id,
    action: 'resource.delete',
    targetType: 'resource',
    targetId: row.id,
    meta: { title: row.title, uploaderId: row.uploaderId },
  })

  return c.body(null, 204)
})
