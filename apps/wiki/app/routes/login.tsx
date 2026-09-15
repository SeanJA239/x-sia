import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, message, TOKEN_KEY } from '../lib/api'

export const meta = () => [
  { title: '编辑者登录 — X-SIA Wiki' },
  { name: 'robots', content: 'noindex' },
]
export default function Login() {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const navigate = useNavigate(),
    [params] = useSearchParams()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return (
    <main id="main" className="narrow">
      <p className="eyebrow">EDITOR ACCESS</p>
      <h1>编辑者登录</h1>
      <p className="lead">使用现有 X-SIA 账号。公开阅读不需要登录。</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            const result = await api<{ token: string }>('/auth/login', {
              method: 'POST',
              body: { email: email.trim(), password },
            })
            localStorage.setItem(TOKEN_KEY, result.token)
            const target = params.get('next') ?? '/manage'
            navigate(/^\/(?:manage|new|edit\/[A-Za-z0-9_-]+)$/.test(target) ? target : '/manage', {
              replace: true,
            })
          } catch (e) {
            setError(message(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={!hydrated || busy}>
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </fieldset>
      </form>
      <p className="muted">普通成员账号可以登录，但不会自动获得 Wiki 编辑权限。</p>
      <Link to="/">返回公开知识库</Link>
    </main>
  )
}
