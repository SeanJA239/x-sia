import type { Database } from '../db/client'
import type { UserRow } from '../types'
import { getDailyQuota, getUsedToday } from './ai'
import type { MembershipRow } from './membership'

export function serializeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatar,
    email_verified_at: user.emailVerifiedAt,
    verified_by: user.verifiedBy,
  }
}

export function serializeMembership(m: MembershipRow) {
  return {
    id: m.id,
    term: m.term,
    status: m.status,
    member_no: m.memberNo,
    paid_confirmed_at: m.paidConfirmedAt,
    in_group_at: m.inGroupAt,
    created_at: m.createdAt,
  }
}

export async function buildQuota(db: Database, orgId: string, userId: string) {
  const [dailyLimit, usedToday] = await Promise.all([
    getDailyQuota(db, orgId, userId),
    getUsedToday(db, orgId, userId),
  ])
  return {
    daily_limit: dailyLimit,
    used_today: usedToday,
    remaining: Math.max(0, dailyLimit - usedToday),
  }
}
