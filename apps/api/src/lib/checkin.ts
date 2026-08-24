import { hmacSignHex } from './crypto'

const WINDOW_SECONDS = 30
const SIG_HEX_LENGTH = 32

export function currentWindow(): number {
  return Math.floor(Date.now() / 1000 / WINDOW_SECONDS)
}

function windowExpiresAtIso(window: number): string {
  return new Date((window + 1) * WINDOW_SECONDS * 1000).toISOString()
}

async function signWindow(secret: string, eventId: string, window: number): Promise<string> {
  const full = await hmacSignHex(secret, `${eventId}.${window}`)
  return full.slice(0, SIG_HEX_LENGTH)
}

/** 大屏轮询用：当前 window 的 token + 该 window 的到期时间。 */
export async function generateCheckinToken(
  secret: string,
  eventId: string,
): Promise<{ token: string; expiresAt: string }> {
  const window = currentWindow()
  const sig = await signWindow(secret, eventId, window)
  return { token: `e.${eventId}.${window}.${sig}`, expiresAt: windowExpiresAtIso(window) }
}

/**
 * 只取 event_id 分段，不做签名校验——路由需要先知道 event_id 才能查出对应的
 * checkin_secret，再调用 verifyCheckinToken() 做真正的验签。
 */
export function extractEventId(token: string): string | null {
  const parts = token.split('.')
  return parts.length === 4 && parts[0] === 'e' && parts[1] ? parts[1] : null
}

export type CheckinTokenError = 'invalid_token' | 'token_expired'

export type CheckinTokenResult =
  | { ok: true; eventId: string }
  | { ok: false; error: CheckinTokenError }

/**
 * 校验 `e.<event_id>.<window>.<sig>`：格式 + 签名 + 容忍当前与上一个 window（±30s 宽限）。
 * 篡改/格式错误一律 invalid_token；签名对但 window 太旧（或来自未来）算 token_expired。
 */
export async function verifyCheckinToken(
  secret: string,
  token: string,
): Promise<CheckinTokenResult> {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'e') return { ok: false, error: 'invalid_token' }
  const [, eventId, windowStr, sig] = parts
  if (!eventId || !windowStr || !sig || sig.length !== SIG_HEX_LENGTH) {
    return { ok: false, error: 'invalid_token' }
  }
  const window = Number.parseInt(windowStr, 10)
  if (!Number.isInteger(window)) return { ok: false, error: 'invalid_token' }

  const expectedCurrent = await signWindow(secret, eventId, window)
  const isCurrentOrPreviousWindow = window === currentWindow() || window === currentWindow() - 1
  const encoder = new TextEncoder()
  const sigMatches = crypto.subtle.timingSafeEqual(
    encoder.encode(expectedCurrent),
    encoder.encode(sig),
  )

  if (!sigMatches) return { ok: false, error: 'invalid_token' }
  if (!isCurrentOrPreviousWindow) return { ok: false, error: 'token_expired' }
  return { ok: true, eventId }
}

const EVENT_GRACE_MS = 30 * 60 * 1000

/** 活动起止时间前后各宽限 30 分钟内都算「进行中」，允许提前/延后签到。 */
export function isEventActiveNow(startsAt: string, endsAt: string): boolean {
  const now = Date.now()
  return (
    now >= new Date(startsAt).getTime() - EVENT_GRACE_MS &&
    now <= new Date(endsAt).getTime() + EVENT_GRACE_MS
  )
}
