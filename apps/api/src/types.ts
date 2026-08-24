import type { Database, schema } from './db/client'

export type OrgRow = typeof schema.org.$inferSelect
export type UserRow = typeof schema.user.$inferSelect
export type SessionRow = typeof schema.session.$inferSelect

/** 所有路由共享：db 连接 + 当前（单租户）org。 */
export type AppEnv = {
  Bindings: Env
  Variables: {
    db: Database
    org: OrgRow
  }
}

/** 经过 Bearer 鉴权中间件后的路由：多出 user + session。 */
export type AuthedEnv = {
  Bindings: Env
  Variables: AppEnv['Variables'] & {
    user: UserRow
    session: SessionRow
  }
}
