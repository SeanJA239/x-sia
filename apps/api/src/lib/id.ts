import { customAlphabet, nanoid } from 'nanoid'

/** 契约要求的通用 id：nanoid 风格随机串。 */
export function newId(): string {
  return nanoid()
}

const sessionTokenAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const sessionToken = customAlphabet(sessionTokenAlphabet, 43)

/** session token：43 字符随机串，明文只在签发响应中出现一次，服务端只存其 SHA-256。 */
export function newSessionToken(): string {
  return sessionToken()
}
