import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { Errors } from '../lib/errors'
import { newId } from '../lib/id'
import { requireAuth } from '../middleware/auth'
import type { AuthedEnv } from '../types'

const fields = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(300).default(''),
  category: z.string().trim().min(1).max(60).default('未分类'),
  body_md: z
    .string()
    .min(1)
    .max(100000)
    .refine((s) => s.trim().length > 0),
  change_note: z.string().trim().min(1).max(300),
})
const createSchema = fields.extend({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})
const versionSchema = z.object({ expected_version: z.number().int().min(1) })
const saveSchema = fields.extend(versionSchema.shape)
const querySchema = z.object({
  q: z.string().trim().max(100).default(''),
  category: z.string().trim().max(60).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
})
const PAGE_SIZE = 30
const publicJoin =
  'FROM wiki_page p JOIN wiki_revision r ON r.id = p.published_revision_id AND r.page_id = p.id AND r.org_id = p.org_id'
const draftJoin =
  'FROM wiki_page p JOIN wiki_revision r ON r.id = p.draft_revision_id AND r.page_id = p.id AND r.org_id = p.org_id'
const conflict = () =>
  Errors.conflict('version_conflict', '此页面已被修改。请先备份当前正文，再刷新获取最新版本。')
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw Errors.badRequest(result.error.issues[0]?.message ?? '参数不合法')
  return result.data
}

async function access(c: Context<AuthedEnv>) {
  const { results } = await c.env.DB.prepare(`SELECT kind FROM entitlement
    WHERE org_id = ? AND user_id = ? AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > ?)
    AND kind IN ('admin', 'wiki_admin', 'wiki_editor')`)
    .bind(c.get('org').id, c.get('user').id, new Date().toISOString())
    .all<{ kind: string }>()
  return {
    can_edit: results.length > 0,
    can_publish: results.some((r) => r.kind === 'admin' || r.kind === 'wiki_admin'),
  }
}
const requireEditor: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  if (!(await access(c)).can_edit) throw Errors.forbidden('需要 Wiki 编辑权限')
  await next()
}
const requirePublisher: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  if (!(await access(c)).can_publish) throw Errors.forbidden('需要 Wiki 发布权限')
  await next()
}

export const wikiRoutes = new Hono<AuthedEnv>()
wikiRoutes.use('/wiki/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})
wikiRoutes.use(
  '/wiki/*',
  bodyLimit({
    maxSize: 512 * 1024,
    onError: (c) =>
      c.json({ error: { code: 'body_too_large', message: '请求体不能超过 512 KiB' } }, 413),
  }),
)

wikiRoutes.get('/wiki/pages', async (c) => {
  const { q, category, page } = parse(querySchema, c.req.query())
  // Escape LIKE metacharacters: search input is a literal substring, not a pattern.
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const where = `WHERE p.org_id = ? AND (? = '' OR r.category = ?)
    AND (? = '' OR r.title LIKE ? ESCAPE '\\' OR r.summary LIKE ? ESCAPE '\\' OR r.body_md LIKE ? ESCAPE '\\')`
  const args = [c.get('org').id, category, category, q, pattern, pattern, pattern]
  const [list, count, categories] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(
      `SELECT p.id, p.slug, r.title, r.summary, r.category, p.published_at ${publicJoin} ${where} ORDER BY p.published_at DESC, p.id LIMIT ? OFFSET ?`,
    ).bind(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    c.env.DB.prepare(`SELECT COUNT(*) AS total ${publicJoin} ${where}`).bind(...args),
    c.env.DB.prepare(
      `SELECT r.category, COUNT(*) AS count ${publicJoin} WHERE p.org_id = ? GROUP BY r.category ORDER BY r.category`,
    ).bind(c.get('org').id),
  ])
  return c.json({
    items: list?.results ?? [],
    categories: categories?.results ?? [],
    total: count?.results[0]?.total ?? 0,
    page,
    page_size: PAGE_SIZE,
  })
})
wikiRoutes.get('/wiki/pages/:slug', async (c) => {
  const row = await c.env.DB.prepare(`SELECT p.id, p.slug, r.title, r.summary, r.category,
    r.body_md, r.number AS revision_number, p.published_at ${publicJoin} WHERE p.org_id = ? AND p.slug = ?`)
    .bind(c.get('org').id, c.req.param('slug'))
    .first()
  if (!row) throw Errors.notFound('条目不存在或尚未发布')
  return c.json(row)
})
wikiRoutes.get('/wiki/access', requireAuth, async (c) => c.json(await access(c)))
wikiRoutes.use('/wiki/manage/*', requireAuth, requireEditor)

wikiRoutes.get('/wiki/manage/pages', async (c) => {
  const { page } = parse(querySchema, c.req.query())
  const [list, count] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(`SELECT p.id, p.slug, p.version, p.updated_at, p.published_at,
      p.published_revision_id, p.draft_revision_id, r.title, r.category ${draftJoin}
      WHERE p.org_id = ? ORDER BY p.updated_at DESC, p.id LIMIT ? OFFSET ?`).bind(
      c.get('org').id,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    ),
    c.env.DB.prepare('SELECT COUNT(*) AS total FROM wiki_page WHERE org_id = ?').bind(
      c.get('org').id,
    ),
  ])
  return c.json({
    items: list?.results ?? [],
    total: count?.results[0]?.total ?? 0,
    page,
    page_size: PAGE_SIZE,
  })
})

wikiRoutes.post('/wiki/manage/pages', async (c) => {
  const data = parse(createSchema, await c.req.json())
  const id = newId(),
    rid = newId(),
    mutation = newId(),
    now = new Date().toISOString()
  const orgId = c.get('org').id,
    actor = c.get('user').id
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO wiki_page (id,org_id,slug,draft_revision_id,version,last_mutation_id,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?)`,
      ).bind(id, orgId, data.slug, rid, mutation, now, now),
      c.env.DB.prepare(
        `INSERT INTO wiki_revision (id,org_id,page_id,number,title,summary,category,body_md,change_note,author_id,created_at) VALUES (?,?,?,1,?,?,?,?,?,?,?)`,
      ).bind(
        rid,
        orgId,
        id,
        data.title,
        data.summary,
        data.category,
        data.body_md,
        data.change_note,
        actor,
        now,
      ),
      c.env.DB.prepare(
        `INSERT INTO audit_log (id,org_id,actor_id,action,target_type,target_id,meta,created_at) VALUES (?,?,?,'wiki.create','wiki_page',?,?,?)`,
      ).bind(newId(), orgId, actor, id, JSON.stringify({ revision_id: rid }), now),
    ])
  } catch (error) {
    // A failed batch rolls back completely. Map only the actual slug collision to 409.
    const duplicate = await c.env.DB.prepare(
      'SELECT id FROM wiki_page WHERE org_id = ? AND slug = ?',
    )
      .bind(orgId, data.slug)
      .first()
    if (duplicate) throw Errors.conflict('slug_taken', '此条目地址已存在，请换一个 Slug')
    throw error
  }
  return c.json({ id, version: 1 }, 201)
})

async function loadPage(c: Context<AuthedEnv>) {
  const row = await c.env.DB.prepare('SELECT * FROM wiki_page WHERE org_id = ? AND id = ?')
    .bind(c.get('org').id, c.req.param('id'))
    .first<{
      id: string
      version: number
      draft_revision_id: string
      published_revision_id: string | null
    }>()
  if (!row) throw Errors.notFound('条目不存在')
  return row
}
wikiRoutes.get('/wiki/manage/pages/:id', async (c) => {
  const row = await loadPage(c)
  const draft = await c.env.DB.prepare(
    'SELECT * FROM wiki_revision WHERE org_id = ? AND page_id = ? AND id = ?',
  )
    .bind(c.get('org').id, row.id, row.draft_revision_id)
    .first()
  return c.json({ ...row, draft })
})

function auditMutation(c: Context<AuthedEnv>, mutation: string, action: string, now: string) {
  return c.env.DB.prepare(`INSERT INTO audit_log (id,org_id,actor_id,action,target_type,target_id,meta,created_at)
    SELECT ?,org_id,?,?,'wiki_page',id,?,? FROM wiki_page
    WHERE org_id = ? AND id = ? AND last_mutation_id = ?`).bind(
    newId(),
    c.get('user').id,
    action,
    JSON.stringify({ mutation_id: mutation }),
    now,
    c.get('org').id,
    c.req.param('id'),
    mutation,
  )
}
wikiRoutes.put('/wiki/manage/pages/:id', async (c) => {
  const data = parse(saveSchema, await c.req.json())
  await loadPage(c)
  const rid = newId(),
    mutation = newId(),
    now = new Date().toISOString()
  // D1 batch is a transaction. A stale version inserts nothing, updates nothing and audits nothing.
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO wiki_revision (id,org_id,page_id,number,title,summary,category,body_md,change_note,author_id,created_at)
      SELECT ?,org_id,id,version+1,?,?,?,?,?,?,? FROM wiki_page WHERE org_id = ? AND id = ? AND version = ?`).bind(
      rid,
      data.title,
      data.summary,
      data.category,
      data.body_md,
      data.change_note,
      c.get('user').id,
      now,
      c.get('org').id,
      c.req.param('id'),
      data.expected_version,
    ),
    c.env.DB.prepare(`UPDATE wiki_page SET draft_revision_id = ?, version = version+1, last_mutation_id = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND version = ?`).bind(
      rid,
      mutation,
      now,
      c.get('org').id,
      c.req.param('id'),
      data.expected_version,
    ),
    auditMutation(c, mutation, 'wiki.save', now),
  ])
  if (result[1]?.meta.changes !== 1) throw conflict()
  return c.json({ id: c.req.param('id'), version: data.expected_version + 1 })
})
wikiRoutes.get('/wiki/manage/pages/:id/revisions', async (c) => {
  await loadPage(c)
  const { page } = parse(querySchema, c.req.query())
  const args = [c.get('org').id, c.req.param('id')]
  const [list, count] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(
      `SELECT id, number, title, change_note, created_at FROM wiki_revision WHERE org_id = ? AND page_id = ? ORDER BY number DESC LIMIT ? OFFSET ?`,
    ).bind(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    c.env.DB.prepare(
      'SELECT COUNT(*) AS total FROM wiki_revision WHERE org_id = ? AND page_id = ?',
    ).bind(...args),
  ])
  return c.json({
    items: list?.results ?? [],
    total: count?.results[0]?.total ?? 0,
    page,
    page_size: PAGE_SIZE,
  })
})
wikiRoutes.get('/wiki/manage/pages/:id/revisions/:rid', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT * FROM wiki_revision WHERE org_id = ? AND page_id = ? AND id = ?',
  )
    .bind(c.get('org').id, c.req.param('id'), c.req.param('rid'))
    .first()
  if (!row) throw Errors.notFound('修订不存在')
  return c.json(row)
})
for (const action of ['publish', 'unpublish'] as const) {
  wikiRoutes.post(`/wiki/manage/pages/:id/${action}`, requirePublisher, async (c) => {
    const { expected_version } = parse(versionSchema, await c.req.json())
    await loadPage(c)
    const mutation = newId(),
      now = new Date().toISOString()
    const result = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE wiki_page SET published_revision_id = ${action === 'publish' ? 'draft_revision_id' : 'NULL'},
        published_at = ?, version = version+1, last_mutation_id = ?, updated_at = ? WHERE org_id = ? AND id = ? AND version = ?`).bind(
        action === 'publish' ? now : null,
        mutation,
        now,
        c.get('org').id,
        c.req.param('id'),
        expected_version,
      ),
      auditMutation(c, mutation, `wiki.${action}`, now),
    ])
    if (result[0]?.meta.changes !== 1) throw conflict()
    return c.json({ id: c.req.param('id'), version: expected_version + 1 })
  })
}
