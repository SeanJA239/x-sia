import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { createDb } from '../db/client'
import { org } from '../db/schema'
import type { AppEnv } from '../types'

/** 单租户运行：seed 一个 org（slug x-sia）。多租户是数据模型层面的预留，这里先固定取它。 */
const ORG_SLUG = 'x-sia'

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.SIGN_SECRET) {
    // 缺失时直接报错，不做静默降级——本地开发把值放进 .dev.vars，线上用 wrangler secret put。
    throw new Error('SIGN_SECRET 未配置：本地开发请复制 .dev.vars.example 为 .dev.vars')
  }

  const db = createDb(c.env.DB)
  const [row] = await db.select().from(org).where(eq(org.slug, ORG_SLUG)).limit(1)
  if (!row) {
    throw new Error(`org「${ORG_SLUG}」不存在，请先执行 migrations + seed`)
  }

  c.set('db', db)
  c.set('org', row)
  await next()
}
