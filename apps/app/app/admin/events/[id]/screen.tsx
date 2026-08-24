import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { ErrorState, LoadingState } from '@/components/ui/StateViews'
import { darkColors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { getAppOrigin } from '@/lib/url'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; url: string; eventTitle: string }

export default function EventScreenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [state, setState] = useState<State>({ status: 'loading' })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tick = useCallback(async () => {
    if (!id) return
    try {
      const [tokenRes, eventsRes] = await Promise.all([
        api.admin.getScreenToken(id),
        api.listEvents(),
      ])
      const event = eventsRes.items.find((e) => e.id === id)
      const url = `${getAppOrigin()}/checkin?t=${encodeURIComponent(tokenRes.token)}`
      setState({ status: 'ready', url, eventTitle: event?.title ?? '活动签到' })

      const msUntilExpiry = new Date(tokenRes.expires_at).getTime() - Date.now()
      const delay = Math.max(msUntilExpiry, 1000)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(tick, delay)
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载签到码失败。',
      })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(tick, 5000)
    }
  }, [id])

  useEffect(() => {
    tick()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [tick])

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))}
        style={styles.closeButton}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="关闭"
      >
        <Feather name="x" size={22} color={darkColors.text} />
      </Pressable>

      {state.status === 'loading' ? (
        <LoadingState label="正在生成签到码…" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={tick} />
      ) : (
        <View style={styles.content}>
          <Text style={styles.eventTitle}>{state.eventTitle}</Text>
          <View style={styles.qrBox}>
            <QRCode value={state.url} size={420} />
          </View>
          <Text style={styles.hint}>用手机相机或已登录的 X-SIA 扫码签到 · 30 秒自动轮转</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkColors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.sm,
  },
  content: {
    alignItems: 'center',
    gap: spacing.xl,
  },
  eventTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: darkColors.text,
    fontFamily: fontFamily.sans,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: spacing.xl,
    borderRadius: 16,
  },
  hint: {
    fontSize: 16,
    color: darkColors.textSecondary,
    fontFamily: fontFamily.sans,
  },
})
