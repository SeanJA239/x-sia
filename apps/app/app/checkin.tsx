import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import type { CheckinErrorCode } from '@/lib/types'

type Result =
  | { kind: 'pending' }
  | { kind: 'success'; eventTitle: string; checkedInAt: string }
  | { kind: 'already'; checkedInAt: string | null }
  | { kind: 'expired' }
  | { kind: 'error'; message: string }
  | { kind: 'missing-token' }

export default function CheckinScreen() {
  const { t } = useLocalSearchParams<{ t?: string }>()
  const router = useRouter()
  const { state } = useAuth()
  const [result, setResult] = useState<Result>({ kind: 'pending' })
  const submittedRef = useRef(false)

  useEffect(() => {
    if (state.status === 'loading') return

    if (!t) {
      setResult({ kind: 'missing-token' })
      return
    }

    if (state.status !== 'signedIn') {
      router.replace(`/login?redirect=${encodeURIComponent(`/checkin?t=${t}`)}`)
      return
    }

    if (submittedRef.current) return
    submittedRef.current = true

    api
      .checkin(t)
      .then((res) => {
        setResult({ kind: 'success', eventTitle: res.event.title, checkedInAt: res.checked_in_at })
      })
      .catch((err: unknown) => {
        if (!(err instanceof ApiError)) {
          setResult({ kind: 'error', message: '签到失败，请稍后重试。' })
          return
        }
        const code = err.code as CheckinErrorCode
        if (code === 'token_expired') {
          setResult({ kind: 'expired' })
          return
        }
        if (code === 'already_checked_in') {
          const details = err.details as { checked_in_at?: string } | undefined
          setResult({ kind: 'already', checkedInAt: details?.checked_in_at ?? null })
          return
        }
        setResult({ kind: 'error', message: err.message })
      })
  }, [state.status, t, router])

  return (
    <View style={styles.root}>
      {result.kind === 'pending' ? (
        <LoadingState label="正在提交签到…" />
      ) : result.kind === 'missing-token' ? (
        <StatusCard
          icon="alert-circle"
          tone="error"
          title="签到码缺失"
          body="请从活动大屏重新扫码。"
        />
      ) : result.kind === 'expired' ? (
        <StatusCard
          icon="refresh-cw"
          tone="warning"
          title="码已轮转"
          body="签到码每 30 秒刷新一次，请重新扫描大屏上的最新二维码。"
        />
      ) : result.kind === 'already' ? (
        <StatusCard
          icon="check-circle"
          tone="info"
          title="你已经签到过了"
          body={
            result.checkedInAt
              ? `签到时间 ${formatDateTime(result.checkedInAt)}`
              : '你已经为这场活动签到过了。'
          }
        />
      ) : result.kind === 'success' ? (
        <StatusCard
          icon="check-circle"
          tone="success"
          title="签到成功"
          body={`${result.eventTitle} · ${formatDateTime(result.checkedInAt)}`}
        />
      ) : (
        <StatusCard icon="x-circle" tone="error" title="签到失败" body={result.message} />
      )}
    </View>
  )
}

function StatusCard({
  icon,
  tone,
  title,
  body,
}: {
  icon: keyof typeof Feather.glyphMap
  tone: 'success' | 'error' | 'warning' | 'info'
  title: string
  body: string
}) {
  const router = useRouter()
  const toneColor =
    tone === 'success'
      ? colors.success
      : tone === 'error'
        ? colors.danger
        : tone === 'warning'
          ? colors.warning
          : colors.link

  return (
    <Surface style={styles.card}>
      <Feather name={icon} size={40} color={toneColor} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Button title="返回首页" onPress={() => router.replace('/')} style={styles.homeButton} />
    </Surface>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
  },
  homeButton: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
})
