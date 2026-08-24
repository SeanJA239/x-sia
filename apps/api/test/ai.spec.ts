import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { aiUsage } from '../src/db/schema'
import app from '../src/index'
import { newId } from '../src/lib/id'
import { createTestUser, db, sessionTokenFor } from './helpers'

async function chat(token: string) {
  return app.request(
    '/api/v1/ai/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    },
    env,
  )
}

async function seedUsage(orgId: string, userId: string, neurons: number) {
  await db().insert(aiUsage).values({
    id: newId(),
    orgId,
    userId,
    model: 'test-model',
    neurons,
    createdAt: new Date().toISOString(),
  })
}

describe('ai gateway quota / circuit breaker', () => {
  it('rejects a non-active member with 403', async () => {
    const { userId } = await createTestUser({
      email: `ai-inactive-${crypto.randomUUID()}@t.com`,
      status: 'applied',
    })
    const token = await sessionTokenFor(userId)
    const res = await chat(token)
    expect(res.status).toBe(403)
  })

  it('returns 429 quota_exceeded once the daily per-user quota is used up', async () => {
    const { org, userId } = await createTestUser({
      email: `ai-quota-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    await seedUsage(org.id, userId, 80) // standard 档日配额已用满
    const token = await sessionTokenFor(userId)

    const res = await chat(token)
    expect(res.status).toBe(429)
    expect((await res.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'quota_exceeded' },
    })
  })

  it('returns 503 circuit_open once the global daily threshold is exceeded', async () => {
    const { org, userId } = await createTestUser({
      email: `ai-circuit-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    // 用另一个用户的用量把全局熔断阈值打满，验证不是靠当前用户自己的配额触发
    const { userId: otherUserId } = await createTestUser({
      email: `ai-circuit-other-${crypto.randomUUID()}@t.com`,
      status: 'active',
    })
    await seedUsage(org.id, otherUserId, 8000)
    const token = await sessionTokenFor(userId)

    const res = await chat(token)
    expect(res.status).toBe(503)
    expect((await res.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'circuit_open' },
    })
  })
})
