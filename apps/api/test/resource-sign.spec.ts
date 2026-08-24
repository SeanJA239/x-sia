import { describe, expect, it, vi } from 'vitest'
import { signResourceUrl, verifyResourceUrl } from '../src/lib/resource-sign'

const SECRET = 'a-secret'

describe('resource signed URL', () => {
  it('accepts a freshly signed URL', async () => {
    const { exp, sig } = await signResourceUrl(SECRET, 'res_1')
    expect(await verifyResourceUrl(SECRET, 'res_1', exp, sig)).toBe(true)
  })

  it('rejects an expired signature', async () => {
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const { exp, sig } = await signResourceUrl(SECRET, 'res_1')

    vi.setSystemTime(now + 6 * 60 * 1000) // 6 分钟后，超过 5 分钟有效期
    expect(await verifyResourceUrl(SECRET, 'res_1', exp, sig)).toBe(false)
    vi.useRealTimers()
  })

  it('rejects a tampered signature', async () => {
    const { exp, sig } = await signResourceUrl(SECRET, 'res_1')
    const tampered = sig.slice(0, -1) + (sig.at(-1) === '0' ? '1' : '0')
    expect(await verifyResourceUrl(SECRET, 'res_1', exp, tampered)).toBe(false)
  })

  it('rejects a signature issued for a different resource id', async () => {
    const { exp, sig } = await signResourceUrl(SECRET, 'res_1')
    expect(await verifyResourceUrl(SECRET, 'res_2', exp, sig)).toBe(false)
  })

  it('rejects a non-hex signature without throwing', async () => {
    const { exp } = await signResourceUrl(SECRET, 'res_1')
    expect(await verifyResourceUrl(SECRET, 'res_1', exp, 'not-hex!!')).toBe(false)
  })
})
