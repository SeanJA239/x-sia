import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'

import { LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { VerifyResult } from '@/lib/types'

type State =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'error'; message: string }
  | { status: 'valid'; data: VerifyResult }

/** 证书验证公开落地页——无需登录，供扫描 /verify/:serial 二维码或分享链接的人核验真伪。 */
export default function VerifyScreen() {
  const { serial } = useLocalSearchParams<{ serial: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(async () => {
    if (!serial) return
    setState({ status: 'loading' })
    try {
      const data = await api.verifyCertificate(serial)
      setState({ status: 'valid', data })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: 'invalid' })
        return
      }
      setState({ status: 'error', message: err instanceof ApiError ? err.message : '验证失败。' })
    }
  }, [serial])

  useEffect(() => {
    load()
  }, [load])

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'invalid' ? (
        <Surface style={styles.card}>
          <Feather name="x-circle" size={40} color={colors.danger} />
          <Text style={styles.title}>无效证书</Text>
          <Text style={styles.body}>没有找到编号为「{serial}」的证书，请确认链接是否正确。</Text>
        </Surface>
      ) : state.status === 'error' ? (
        <Surface style={styles.card}>
          <Feather name="alert-circle" size={40} color={colors.warning} />
          <Text style={styles.title}>验证失败</Text>
          <Text style={styles.body}>{state.message}</Text>
        </Surface>
      ) : (
        <Surface style={styles.card}>
          <Feather name="check-circle" size={40} color={colors.success} />
          <Text style={styles.title}>证书有效</Text>
          <Text style={styles.holder}>{state.data.holder_display_name}</Text>
          <Text style={styles.body}>{state.data.event_title}</Text>
          <Text style={styles.meta}>签发于 {formatDateTime(state.data.issued_at)}</Text>
          <Text style={styles.serial}>{serial}</Text>
        </Surface>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.paper,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  holder: {
    fontSize: 20,
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
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  serial: {
    fontSize: 12,
    color: colors.numberGold,
    fontFamily: fontFamily.mono,
    marginTop: spacing.xs,
  },
})
