import type { Database } from '../db/client'
import { session } from '../db/schema'
import { hashSessionToken } from './crypto'
import { newId, newSessionToken } from './id'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

/** 返回明文 token（只在这一次调用中出现），服务端只落库其 SHA-256。 */
export async function createSession(db: Database, userId: string): Promise<string> {
  const token = newSessionToken()
  const now = new Date()
  await db.insert(session).values({
    id: newId(),
    userId,
    tokenHash: await hashSessionToken(token),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
  })
  return token
}
