const PBKDF2_ITERATIONS = 120_000
const SALT_BYTES = 16
const HASH_BYTES = 32

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    keyMaterial,
    HASH_BYTES * 8,
  )
}

/** 格式 `iterations:salt:hash`，salt/hash 均为 hex。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, PBKDF2_ITERATIONS)
  return `${PBKDF2_ITERATIONS}:${toHex(salt.buffer)}:${toHex(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterationsStr, saltHex, hashHex] = stored.split(':')
  if (!iterationsStr || !saltHex || !hashHex) return false
  const iterations = Number.parseInt(iterationsStr, 10)
  const salt = fromHex(saltHex)
  const expected = fromHex(hashHex)
  const actual = await derive(password, salt, iterations)
  if (actual.byteLength !== expected.byteLength) return false
  return crypto.subtle.timingSafeEqual(actual, expected)
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return toHex(digest)
}

/** session token 只存 hash，登录态校验时用同一函数重算比对。 */
export const hashSessionToken = sha256Hex

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function hmacSignHex(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toHex(sig)
}

export async function hmacVerifyHex(
  secret: string,
  message: string,
  signatureHex: string,
): Promise<boolean> {
  if (!/^[0-9a-f]+$/i.test(signatureHex)) return false
  const key = await hmacKey(secret)
  let signature: Uint8Array
  try {
    signature = fromHex(signatureHex)
  } catch {
    return false
  }
  return crypto.subtle.verify(
    'HMAC',
    key,
    signature as BufferSource,
    new TextEncoder().encode(message),
  )
}
