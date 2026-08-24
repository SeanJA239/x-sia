/**
 * 一次性脚本：用运行时同款 hashPassword() 生成 seed.sql 里要粘贴的密码 hash。
 * 跑 `npx tsx scripts/generate-seed-hashes.ts`，把输出粘进 seed.sql 对应 INSERT 语句。
 * 不在测试或部署流程中执行。
 */
import { hashPassword } from '../src/lib/crypto'

const accounts = [
  { email: 'admin@x-sia.test', password: 'admin1234' },
  { email: 'member@x-sia.test', password: 'member1234' },
  { email: 'applied@x-sia.test', password: 'applied1234' },
]

for (const { email, password } of accounts) {
  const hash = await hashPassword(password)
  console.log(`${email} (明文: ${password}):\n  ${hash}\n`)
}
