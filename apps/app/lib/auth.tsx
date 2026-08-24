import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { ApiError, api } from './api'
import { clearToken, getToken } from './storage'
import type { Entitlement, Membership, Quota, User } from './types'

type SignedInState = {
  status: 'signedIn'
  user: User
  membership: Membership
  entitlements: Entitlement[]
  quota: Quota
}

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'bootError'; message: string }
  | SignedInState

type AuthContextValue = {
  state: AuthState
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  retryBoot: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const loadMe = useCallback(async () => {
    const me = await api.me()
    setState({
      status: 'signedIn',
      user: me.user,
      membership: me.membership,
      entitlements: me.entitlements,
      quota: me.quota,
    })
  }, [])

  const boot = useCallback(async () => {
    setState({ status: 'loading' })
    const token = await getToken()
    if (!token) {
      setState({ status: 'signedOut' })
      return
    }
    try {
      await loadMe()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearToken()
        setState({ status: 'signedOut' })
        return
      }
      const message = err instanceof ApiError ? err.message : '启动时发生未知错误。'
      setState({ status: 'bootError', message })
    }
  }, [loadMe])

  useEffect(() => {
    boot()
  }, [boot])

  const login = useCallback(
    async (email: string, password: string) => {
      await api.login({ email, password })
      await loadMe()
    },
    [loadMe],
  )

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      await api.register({ email, password, display_name: displayName })
      await loadMe()
    },
    [loadMe],
  )

  const logout = useCallback(async () => {
    await api.logout()
    setState({ status: 'signedOut' })
  }, [])

  const refresh = useCallback(async () => {
    if (state.status !== 'signedIn') return
    await loadMe()
  }, [state.status, loadMe])

  const isAdmin = state.status === 'signedIn' && state.entitlements.some((e) => e.kind === 'admin')

  const value = useMemo<AuthContextValue>(
    () => ({ state, isAdmin, login, register, logout, refresh, retryBoot: boot }),
    [state, isAdmin, login, register, logout, refresh, boot],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
