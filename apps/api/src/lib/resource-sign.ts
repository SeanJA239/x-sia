import { hmacSignHex, hmacVerifyHex } from './crypto'

const SIGNED_URL_TTL_SECONDS = 5 * 60

function payload(id: string, exp: number): string {
  return `${id}:${exp}`
}

/** 返回 `{ exp, sig }`，exp 为 Unix 秒时间戳，5 分钟后过期。 */
export async function signResourceUrl(
  secret: string,
  id: string,
): Promise<{ exp: number; sig: string }> {
  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS
  const sig = await hmacSignHex(secret, payload(id, exp))
  return { exp, sig }
}

export async function verifyResourceUrl(
  secret: string,
  id: string,
  exp: number,
  sig: string,
): Promise<boolean> {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  return hmacVerifyHex(secret, payload(id, exp), sig)
}
