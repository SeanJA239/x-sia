import { and, eq, gt, gte, isNull, or, sum } from 'drizzle-orm'
import type { Database } from '../db/client'
import { aiUsage, entitlement } from '../db/schema'

export const DEFAULT_MODEL = '@cf/meta/llama-3.2-3b-instruct'
/** standard 档人日估算配额（neurons），entitlement kind='ai_chat' 的 tier 可提档覆盖。 */
export const STANDARD_DAILY_NEURONS = 80
/** 全局日总量熔断阈值：Workers AI 免费额度 10,000 neurons/天是账号级，留出余量。 */
export const GLOBAL_DAILY_CIRCUIT_THRESHOLD = 8000

/**
 * neurons 粗略估算：按输入+输出字符数近似（约 4 字符 ≈ 1 token，token 数近似当作
 * neurons 计价单位）。这不是 Workers AI 账单上的精确 neurons 数，只用于内部配额判定，
 * 量级对齐即可。
 */
export function estimateNeurons(inputChars: number, outputChars: number): number {
  return Math.max(1, Math.ceil((inputChars + outputChars) / 4))
}

function startOfTodayIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

/** entitlement kind='ai_chat' 的 tier 存放每日 neurons 配额（字符串数字），取最大值提档。 */
export async function getDailyQuota(db: Database, orgId: string, userId: string): Promise<number> {
  const now = new Date().toISOString()
  const rows = await db
    .select({ tier: entitlement.tier })
    .from(entitlement)
    .where(
      and(
        eq(entitlement.orgId, orgId),
        eq(entitlement.userId, userId),
        eq(entitlement.kind, 'ai_chat'),
        isNull(entitlement.revokedAt),
        or(isNull(entitlement.expiresAt), gt(entitlement.expiresAt, now)),
      ),
    )
  let quota = STANDARD_DAILY_NEURONS
  for (const row of rows) {
    const tier = row.tier ? Number.parseInt(row.tier, 10) : Number.NaN
    if (Number.isFinite(tier) && tier > quota) quota = tier
  }
  return quota
}

export async function getUsedToday(db: Database, orgId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(aiUsage.neurons) })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.orgId, orgId),
        eq(aiUsage.userId, userId),
        gte(aiUsage.createdAt, startOfTodayIso()),
      ),
    )
  return Number(row?.total ?? 0)
}

export async function getGlobalUsedToday(db: Database, orgId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(aiUsage.neurons) })
    .from(aiUsage)
    .where(and(eq(aiUsage.orgId, orgId), gte(aiUsage.createdAt, startOfTodayIso())))
  return Number(row?.total ?? 0)
}
