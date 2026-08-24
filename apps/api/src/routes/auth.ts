import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { entitlement, membership, session, user } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { AppError, Errors } from '../lib/errors'
import { newId } from '../lib/id'
import { getLatestMembership } from '../lib/membership'
import { buildQuota, serializeMembership, serializeUser } from '../lib/serialize'
import { createSession } from '../lib/session'
import { getCurrentTerm } from '../lib/term'
import { requireAuth } from '../middleware/auth'
import type { AppEnv } from '../types'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, '密码至少 8 位'),
  display_name: z.string().min(1).max(50),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/auth/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')
  const { email, password, display_name } = parsed.data

  const db = c.get('db')
  const org = c.get('org')

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)
  if (existing) throw Errors.conflict('email_taken', '该邮箱已注册')

  const now = new Date().toISOString()
  const userId = newId()
  await db.insert(user).values({
    id: userId,
    email,
    passwordHash: await hashPassword(password),
    displayName: display_name,
    createdAt: now,
  })
  // 注册即创建当届 membership（status applied），不发验证邮件，第一年现场人肉核验。
  await db.insert(membership).values({
    id: newId(),
    orgId: org.id,
    userId,
    term: getCurrentTerm(),
    status: 'applied',
    createdAt: now,
  })

  const token = await createSession(db, userId)
  const [userRow] = await db.select().from(user).where(eq(user.id, userId)).limit(1)
  if (!userRow) throw new Error('register: user row disappeared mid-transaction')

  return c.json({ token, user: serializeUser(userRow) }, 201)
})

authRoutes.post('/auth/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')
  const { email, password } = parsed.data

  const db = c.get('db')
  const [userRow] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (!userRow || !(await verifyPassword(password, userRow.passwordHash))) {
    throw Errors.unauthorized('邮箱或密码错误')
  }

  const token = await createSession(db, userRow.id)
  return c.json({ token, user: serializeUser(userRow) })
})

authRoutes.post('/auth/logout', requireAuth, async (c) => {
  const db = c.get('db')
  await db.delete(session).where(eq(session.id, c.get('session').id))
  return c.body(null, 204)
})

authRoutes.get('/me', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const now = new Date().toISOString()
  const [membershipRow, entitlements, quota] = await Promise.all([
    getLatestMembership(db, org.id, currentUser.id),
    db
      .select()
      .from(entitlement)
      .where(
        and(
          eq(entitlement.orgId, org.id),
          eq(entitlement.userId, currentUser.id),
          isNull(entitlement.revokedAt),
          or(isNull(entitlement.expiresAt), gt(entitlement.expiresAt, now)),
        ),
      ),
    buildQuota(db, org.id, currentUser.id),
  ])

  return c.json({
    user: serializeUser(currentUser),
    membership: membershipRow ? serializeMembership(membershipRow) : null,
    entitlements: entitlements.map((e) => ({
      kind: e.kind,
      tier: e.tier,
      granted_at: e.grantedAt,
      expires_at: e.expiresAt,
    })),
    quota,
  })
})
