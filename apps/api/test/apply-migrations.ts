import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// setup 文件运行在每个测试文件的存储隔离之外，且可能被多次调用；
// applyD1Migrations() 只应用尚未应用过的迁移，重复调用是安全的。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
