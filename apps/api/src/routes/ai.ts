import { Hono } from 'hono'
import { z } from 'zod'
import { aiUsage } from '../db/schema'
import {
  DEFAULT_MODEL,
  estimateNeurons,
  GLOBAL_DAILY_CIRCUIT_THRESHOLD,
  getDailyQuota,
  getGlobalUsedToday,
  getUsedToday,
} from '../lib/ai'
import { AppError, Errors } from '../lib/errors'
import { newId } from '../lib/id'
import { getLatestMembership } from '../lib/membership'
import { requireAuth } from '../middleware/auth'
import type { AppEnv } from '../types'

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .min(1),
})

export const aiRoutes = new Hono<AppEnv>()

aiRoutes.post('/ai/chat', requireAuth, async (c) => {
  const parsed = chatSchema.safeParse(await c.req.json())
  if (!parsed.success)
    throw new AppError(400, 'bad_request', parsed.error.issues[0]?.message ?? '参数不合法')
  const { messages } = parsed.data

  const db = c.get('db')
  const org = c.get('org')
  const currentUser = c.get('user')

  const membershipRow = await getLatestMembership(db, org.id, currentUser.id)
  if (membershipRow?.status !== 'active') {
    throw Errors.forbidden('仅 active 社员可使用 AI 网关')
  }

  const globalUsed = await getGlobalUsedToday(db, org.id)
  if (globalUsed >= GLOBAL_DAILY_CIRCUIT_THRESHOLD) throw Errors.circuitOpen()

  const [dailyLimit, usedToday] = await Promise.all([
    getDailyQuota(db, org.id, currentUser.id),
    getUsedToday(db, org.id, currentUser.id),
  ])
  if (usedToday >= dailyLimit) throw Errors.quotaExceeded()

  const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  const result = await c.env.AI.run(DEFAULT_MODEL, { messages })
  const reply =
    typeof result === 'object' && result && 'response' in result ? (result.response ?? '') : ''
  const neurons = estimateNeurons(inputChars, reply.length)

  await db.insert(aiUsage).values({
    id: newId(),
    orgId: org.id,
    userId: currentUser.id,
    model: DEFAULT_MODEL,
    neurons,
    createdAt: new Date().toISOString(),
  })

  return c.json({ reply, usage: { neurons_est: neurons } })
})
