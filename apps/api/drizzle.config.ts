import { defineConfig } from 'drizzle-kit'

// 只用 `drizzle-kit generate` 产出 SQL 到 migrations/；实际落地用
// `wrangler d1 migrations apply`，不用 drizzle-kit push/migrate，因此无需 dbCredentials。
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
})
