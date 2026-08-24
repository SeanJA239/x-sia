import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { user } from '../db/schema'
import { Errors } from '../lib/errors'
import { getLatestMembership } from '../lib/membership'
import { buildQuota } from '../lib/serialize'
import { getWornTitleName } from '../lib/titles'
import { requireAuth } from '../middleware/auth'
import type { AppEnv } from '../types'

export const publicRoutes = new Hono<AppEnv>()

publicRoutes.get('/users/:id/public', async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const id = c.req.param('id')

  const [userRow] = await db.select().from(user).where(eq(user.id, id)).limit(1)
  if (!userRow) throw Errors.notFound('用户不存在')

  const [membershipRow, title] = await Promise.all([
    getLatestMembership(db, org.id, id),
    getWornTitleName(db, org.id, id),
  ])

  return c.json({
    display_name: userRow.displayName,
    avatar: userRow.avatar,
    member_no: membershipRow?.memberNo ?? null,
    term: membershipRow?.term ?? null,
    status: membershipRow?.status ?? null,
    title,
    joined_at: membershipRow?.createdAt ?? null,
  })
})

publicRoutes.get('/card', requireAuth, async (c) => {
  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const [membershipRow, title, quota] = await Promise.all([
    getLatestMembership(db, org.id, currentUser.id),
    getWornTitleName(db, org.id, currentUser.id),
    buildQuota(db, org.id, currentUser.id),
  ])

  const quotaPct =
    quota.daily_limit > 0
      ? Math.round(((quota.daily_limit - quota.remaining) / quota.daily_limit) * 100)
      : 0

  return c.json({
    display_name: currentUser.displayName,
    member_no: membershipRow?.memberNo ?? null,
    term: membershipRow?.term ?? null,
    title,
    stats: {
      // 活动签到（§9 阶段三）本轮未实现，契约要求先占位为 0。
      attendance_count: 0,
      quota_pct: quotaPct,
    },
    qr_payload: `/u/${currentUser.id}`,
  })
})
