import type { readD1Migrations } from '@cloudflare/vitest-pool-workers'

type D1Migration = Awaited<ReturnType<typeof readD1Migrations>>[number]

// 这个文件有顶层 import，会被当成模块；要扩展全局的 Cloudflare.Env 必须显式 declare global。
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
