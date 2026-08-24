import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { Chip } from '@/components/ui/Chip'
import { ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import type { PublicUser } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  applied: '报名中',
  pending_payment: '待缴费',
  active: '在册',
  expired: '已过期',
  revoked: '已取消',
  reviewing: '审核中',
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PublicUser }

/**
 * 身份二维码扫描落地页——公开、无需登录，仅用于人工核验。
 */
export default function PublicIdentityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(async () => {
    if (!id) return
    setState({ status: 'loading' })
    try {
      const data = await api.getPublicUser(id)
      setState({ status: 'ready', data })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载失败。',
      })
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : (
        <Surface style={styles.card}>
          <Text style={styles.name}>{state.data.display_name}</Text>
          <View style={styles.chipRow}>
            {state.data.member_no != null ? (
              <Chip label={`#${state.data.member_no}`} tone="gold" mono />
            ) : null}
            <Chip label={STATUS_LABEL[state.data.status] ?? state.data.status} tone="neutral" />
            {state.data.title ? <Chip label={state.data.title} tone="neutral" /> : null}
          </View>
          <Text style={styles.meta}>届别 {state.data.term}</Text>
          <Text style={styles.meta}>
            加入于 {new Date(state.data.joined_at).toLocaleDateString('zh-CN')}
          </Text>
          <Text style={styles.disclaimer}>本页仅用于人工核验成员身份，不作为签到凭证。</Text>
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
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  disclaimer: {
    marginTop: spacing.md,
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
  },
})
