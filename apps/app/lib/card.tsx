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
import { useAuth } from './auth'
import type { CardData } from './types'
import { toAbsoluteUrl } from './url'

type CardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: CardData }

type CardContextValue = {
  state: CardState
  refresh: () => void
}

const CardContext = createContext<CardContextValue | null>(null)

/**
 * 卡片数据（GET /card）全局共享一份：全屏卡片路由、我的页身份码、
 * 桌面右侧栏迷你卡都读同一份，避免重复请求。
 */
export function CardProvider({ children }: { children: ReactNode }) {
  const { state: authState } = useAuth()
  const [state, setState] = useState<CardState>({ status: 'idle' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const data = await api.getCard()
      setState({ status: 'ready', data: { ...data, qr_payload: toAbsoluteUrl(data.qr_payload) } })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '加载卡片数据失败。'
      setState({ status: 'error', message })
    }
  }, [])

  useEffect(() => {
    if (authState.status === 'signedIn') {
      load()
    } else {
      setState({ status: 'idle' })
    }
  }, [authState.status, load])

  const value = useMemo<CardContextValue>(() => ({ state, refresh: load }), [state, load])

  return <CardContext.Provider value={value}>{children}</CardContext.Provider>
}

export function useCard(): CardContextValue {
  const ctx = useContext(CardContext)
  if (!ctx) throw new Error('useCard 必须在 CardProvider 内使用')
  return ctx
}
