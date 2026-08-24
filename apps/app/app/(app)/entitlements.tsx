import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import type { Entitlement, Quota } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: Entitlement[]; quota: Quota }

export default function EntitlementsScreen() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await api.getEntitlements()
      setState({ status: 'ready', items: res.items, quota: res.quota })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载权益信息失败。',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppScreen title="我的权益" withSidebar={false}>
      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : (
        <>
          <Surface style={styles.quotaCard}>
            <Text style={styles.sectionLabel}>今日 AI 额度</Text>
            <Text style={styles.quotaNumber}>
              {state.quota.remaining}
              <Text style={styles.quotaUnit}> / {state.quota.daily_limit}</Text>
            </Text>
            <ProgressBar
              pct={(state.quota.remaining / Math.max(state.quota.daily_limit, 1)) * 100}
            />
            <Text style={styles.quotaHint}>
              今日已用 {state.quota.used_today}，单位为估算 neurons。
            </Text>
          </Surface>

          <Surface>
            <Text style={styles.sectionLabel}>已生效权益</Text>
            {state.items.length === 0 ? (
              <EmptyState message="暂无已生效的权益。" />
            ) : (
              <View style={styles.list}>
                {state.items.map((item) => (
                  <View key={`${item.kind}-${item.granted_at}`} style={styles.listRow}>
                    <Chip label={item.kind} tone="gold" />
                    {item.tier ? <Text style={styles.tier}>{item.tier}</Text> : null}
                    <Text style={styles.grantedAt}>
                      {new Date(item.granted_at).toLocaleDateString('zh-CN')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Surface>

          <AiChatTrial />
        </>
      )}
    </AppScreen>
  )
}

function AiChatTrial() {
  const [input, setInput] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const onSend = async () => {
    if (!input.trim()) return
    setSending(true)
    setError(null)
    setReply(null)
    try {
      const res = await api.aiChat([{ role: 'user', content: input.trim() }])
      setReply(res.reply)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'quota_exceeded') {
        setError('今日 AI 额度已用完，请明天再试。')
      } else if (err instanceof ApiError && err.code === 'circuit_open') {
        setError('全站 AI 额度暂时耗尽，请稍后再试。')
      } else {
        setError(err instanceof ApiError ? err.message : 'AI 试用请求失败。')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Surface style={styles.chatCard}>
      <Text style={styles.sectionLabel}>AI Chat 试用</Text>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="问点什么…"
        placeholderTextColor={colors.textMuted}
        style={styles.chatInput}
        multiline
      />
      <Button title="发送" onPress={onSend} loading={sending} disabled={!input.trim()} />
      {reply ? (
        <View style={styles.replyBox}>
          <Text style={styles.replyText}>{reply}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.chatError}>{error}</Text> : null}
    </Surface>
  )
}

const styles = StyleSheet.create({
  quotaCard: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
    marginBottom: spacing.xs,
  },
  quotaNumber: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.mono,
  },
  quotaUnit: {
    fontSize: 18,
    color: colors.textMuted,
    fontFamily: fontFamily.mono,
    fontWeight: '400',
  },
  quotaHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  list: {
    gap: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tier: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  grantedAt: {
    marginLeft: 'auto',
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.mono,
  },
  chatCard: {
    gap: spacing.sm,
  },
  chatInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    fontFamily: fontFamily.sans,
    color: colors.text,
    textAlignVertical: 'top',
  },
  replyBox: {
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  replyText: {
    fontSize: 14,
    color: colors.text,
    fontFamily: fontFamily.sans,
    lineHeight: 20,
  },
  chatError: {
    fontSize: 13,
    color: colors.danger,
    fontFamily: fontFamily.sans,
  },
})
