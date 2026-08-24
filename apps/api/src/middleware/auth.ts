import { and, eq, gt } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { session, user } from '../db/schema'
import { hashSessionToken } from '../lib/crypto'
import { Errors } from '../lib/errors'
import { isAdmin } from '../lib/roles'
import type { AuthedEnv } from '../types'

export const requireAuth: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (!token) throw Errors.unauthorized()

  const db = c.get('db')
  const tokenHash = await hashSessionToken(token)
  const now = new Date().toISOString()

  const [row] = await db
    .select()
    .from(session)
    .where(and(eq(session.tokenHash, tokenHash), gt(session.expiresAt, now)))
    .limit(1)
  if (!row) throw Errors.unauthorized()

  const [userRow] = await db.select().from(user).where(eq(user.id, row.userId)).limit(1)
  if (!userRow) throw Errors.unauthorized()

  c.set('session', row)
  c.set('user', userRow)
  await next()
}

export const requireAdmin: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  const db = c.get('db')
  const org = c.get('org')
  const user = c.get('user')
  if (!(await isAdmin(db, org.id, user.id))) throw Errors.forbidden('需要 admin 权限')
  await next()
}
