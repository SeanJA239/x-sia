import { and, count, desc, eq, lt, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { comment, post, user } from '../db/schema'
import { auditLogInsert } from '../lib/audit'
import { AppError, Errors } from '../lib/errors'
import { makeExcerpt } from '../lib/excerpt'
import { newId } from '../lib/id'
import { getLatestMembership } from '../lib/membership'
import { decodeCursor, encodeCursor } from '../lib/pagination'
import { isAdmin } from '../lib/roles'
import { requireAuth } from '../middleware/auth'
import type { AppEnv } from '../types'

export const postRoutes = new Hono<AppEnv>()

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

postRoutes.get('/posts', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const kind = c.req.query('kind')
  const cursor = decodeCursor(c.req.query('cursor'))
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(c.req.query('limit') ?? '', 10) || DEFAULT_PAGE_SIZE),
  )

  const conditions = [eq(post.orgId, org.id), eq(post.status, 'published')]
  if (kind === 'wall' || kind === 'article') conditions.push(eq(post.kind, kind))
  if (cursor) {
    conditions.push(
      or(
        lt(post.createdAt, cursor.createdAt),
        and(eq(post.createdAt, cursor.createdAt), lt(post.id, cursor.id)),
      ) ?? eq(post.orgId, org.id),
    )
  }

  const rows = await db
    .select({
      id: post.id,
      kind: post.kind,
      title: post.title,
      bodyMd: post.bodyMd,
      authorId: user.id,
      authorDisplayName: user.displayName,
      commentCount: count(comment.id),
      createdAt: post.createdAt,
    })
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .leftJoin(comment, eq(comment.postId, post.id))
    .where(and(...conditions))
    .groupBy(post.id)
    .orderBy(desc(post.createdAt), desc(post.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)

  return c.json({
    items: page.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      excerpt: makeExcerpt(r.bodyMd),
      author: { id: r.authorId, display_name: r.authorDisplayName },
      comment_count: r.commentCount,
      created_at: r.createdAt,
    })),
    next_cursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  })
})

async function loadVisiblePost(db: Database, orgId: string, id: string, requesterId: string) {
  const [row] = await db
    .select()
    .from(post)
    .where(and(eq(post.orgId, orgId), eq(post.id, id)))
    .limit(1)
  if (!row) throw Errors.notFound('帖子不存在')
  if (row.status !== 'published') {
    const admin = await isAdmin(db, orgId, requesterId)
    if (row.authorId !== requesterId && !admin) throw Errors.notFound('帖子不存在')
  }
  return row
}

postRoutes.get('/posts/:id', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')
  const row = await loadVisiblePost(db, org.id, c.req.param('id'), currentUser.id)

  const [[authorRow], comments] = await Promise.all([
    db
      .select({ id: user.id, displayName: user.displayName })
      .from(user)
      .where(eq(user.id, row.authorId))
      .limit(1),
    db
      .select({
        id: comment.id,
        body: comment.body,
        authorId: user.id,
        authorDisplayName: user.displayName,
        createdAt: comment.createdAt,
      })
      .from(comment)
      .innerJoin(user, eq(user.id, comment.authorId))
      .where(eq(comment.postId, row.id))
      .orderBy(comment.createdAt),
  ])

  return c.json({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body_md: row.bodyMd,
    author: authorRow ? { id: authorRow.id, display_name: authorRow.displayName } : null,
    created_at: row.createdAt,
    comments: comments.map((cm) => ({
      id: cm.id,
      body: cm.body,
      author: { id: cm.authorId, display_name: cm.authorDisplayName },
      created_at: cm.createdAt,
    })),
  })
})

const postCreateSchema = z.object({
  kind: z.enum(['wall', 'article']),
  title: z.string().min(1).max(200),
  body_md: z.string().min(1),
})

postRoutes.post('/posts', requireAuth, async (c) => {
  const parsed = postCreateSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const membershipRow = await getLatestMembership(db, org.id, currentUser.id)
  if (membershipRow?.status !== 'active') throw Errors.forbidden('仅 active 社员可发帖')

  const now = new Date().toISOString()
  const id = newId()
  await db.insert(post).values({
    id,
    orgId: org.id,
    authorId: currentUser.id,
    kind: parsed.data.kind,
    title: parsed.data.title,
    bodyMd: parsed.data.body_md,
    status: 'published',
    createdAt: now,
  })

  return c.json(
    {
      id,
      kind: parsed.data.kind,
      title: parsed.data.title,
      body_md: parsed.data.body_md,
      author: { id: currentUser.id, display_name: currentUser.displayName },
      created_at: now,
    },
    201,
  )
})

const commentCreateSchema = z.object({ body: z.string().min(1) })

postRoutes.post('/posts/:id/comments', requireAuth, async (c) => {
  const parsed = commentCreateSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')

  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const membershipRow = await getLatestMembership(db, org.id, currentUser.id)
  if (membershipRow?.status !== 'active') throw Errors.forbidden('仅 active 社员可评论')

  const [postRow] = await db
    .select({ id: post.id, status: post.status })
    .from(post)
    .where(and(eq(post.orgId, org.id), eq(post.id, c.req.param('id'))))
    .limit(1)
  if (postRow?.status !== 'published') throw Errors.notFound('帖子不存在')

  const now = new Date().toISOString()
  const id = newId()
  await db.insert(comment).values({
    id,
    orgId: org.id,
    postId: postRow.id,
    authorId: currentUser.id,
    body: parsed.data.body,
    createdAt: now,
  })

  return c.json(
    {
      id,
      body: parsed.data.body,
      author: { id: currentUser.id, display_name: currentUser.displayName },
      created_at: now,
    },
    201,
  )
})

postRoutes.delete('/posts/:id', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const [row] = await db
    .select()
    .from(post)
    .where(and(eq(post.orgId, org.id), eq(post.id, c.req.param('id'))))
    .limit(1)
  if (!row) throw Errors.notFound('帖子不存在')

  const admin = await isAdmin(db, org.id, currentUser.id)
  if (row.authorId !== currentUser.id && !admin)
    throw Errors.forbidden('只有作者本人或 admin 可以删除该帖子')

  await db.update(post).set({ status: 'removed' }).where(eq(post.id, row.id))
  await auditLogInsert(db, {
    orgId: org.id,
    actorId: currentUser.id,
    action: 'post.remove',
    targetType: 'post',
    targetId: row.id,
    meta: { authorId: row.authorId },
  })

  return c.body(null, 204)
})

postRoutes.delete('/comments/:id', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const [row] = await db
    .select()
    .from(comment)
    .where(and(eq(comment.orgId, org.id), eq(comment.id, c.req.param('id'))))
    .limit(1)
  if (!row) throw Errors.notFound('评论不存在')

  const admin = await isAdmin(db, org.id, currentUser.id)
  if (row.authorId !== currentUser.id && !admin)
    throw Errors.forbidden('只有作者本人或 admin 可以删除该评论')

  await db.delete(comment).where(eq(comment.id, row.id))
  await auditLogInsert(db, {
    orgId: org.id,
    actorId: currentUser.id,
    action: 'comment.delete',
    targetType: 'comment',
    targetId: row.id,
    meta: { authorId: row.authorId, postId: row.postId },
  })

  return c.body(null, 204)
})
