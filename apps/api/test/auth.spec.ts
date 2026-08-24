import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import app from '../src/index'
import { getOrCreateOrg } from './helpers'

function json(body: unknown) {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

describe('auth flow', () => {
  it('register -> login -> me -> logout -> me rejected', async () => {
    await getOrCreateOrg()
    const email = `flow-${crypto.randomUUID()}@t.com`

    const registerRes = await app.request(
      '/api/v1/auth/register',
      { method: 'POST', ...json({ email, password: 'password123', display_name: '流程测试' }) },
      env,
    )
    expect(registerRes.status).toBe(201)
    const registered = (await registerRes.json()) as { token: string; user: { id: string } }
    expect(registered.token).toHaveLength(43)

    const dup = await app.request(
      '/api/v1/auth/register',
      { method: 'POST', ...json({ email, password: 'password123', display_name: '重复' }) },
      env,
    )
    expect(dup.status).toBe(409)
    expect((await dup.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'email_taken' },
    })

    const loginRes = await app.request(
      '/api/v1/auth/login',
      { method: 'POST', ...json({ email, password: 'password123' }) },
      env,
    )
    expect(loginRes.status).toBe(200)
    const { token } = (await loginRes.json()) as { token: string }

    const badLogin = await app.request(
      '/api/v1/auth/login',
      { method: 'POST', ...json({ email, password: 'wrong-password' }) },
      env,
    )
    expect(badLogin.status).toBe(401)

    const meRes = await app.request(
      '/api/v1/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    )
    expect(meRes.status).toBe(200)
    const me = (await meRes.json()) as {
      user: { email: string }
      membership: { status: string; term: string }
      quota: { daily_limit: number }
    }
    expect(me.user.email).toBe(email)
    expect(me.membership.status).toBe('applied')
    expect(me.quota.daily_limit).toBe(80)

    const logoutRes = await app.request(
      '/api/v1/auth/logout',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      env,
    )
    expect(logoutRes.status).toBe(204)

    const meAfterLogout = await app.request(
      '/api/v1/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    )
    expect(meAfterLogout.status).toBe(401)
  })

  it('rejects requests without a bearer token', async () => {
    const res = await app.request('/api/v1/me', {}, env)
    expect(res.status).toBe(401)
  })
})
