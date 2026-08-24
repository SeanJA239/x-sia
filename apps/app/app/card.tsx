import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { MemberCard } from '@/components/MemberCard'
import { ErrorState, LoadingState } from '@/components/ui/StateViews'
import { darkColors, fontFamily, radius, spacing } from '@/constants/theme'
import { useCard } from '@/lib/card'

export default function CardScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { state, refresh } = useCard()
  const [flipped, setFlipped] = useState(false)

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={[styles.closeButton, { top: insets.top + spacing.sm }]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="关闭"
      >
        <Feather name="x" size={20} color={darkColors.text} />
      </Pressable>

      {state.status === 'loading' || state.status === 'idle' ? (
        <LoadingState label="正在加载会员卡…" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={refresh} />
      ) : (
        <View style={styles.content}>
          <MemberCard data={state.data} flipped={flipped} />

          <View style={styles.tiles}>
            <DataTile label="出勤" value={String(state.data.stats.attendance_count)} />
            <DataTile label="AI 额度" value={`${state.data.stats.quota_pct}%`} />
            <DataTile
              label="编号"
              value={state.data.member_no != null ? `#${state.data.member_no}` : '待分配'}
            />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.actionButton} onPress={() => setFlipped((v) => !v)}>
              <Feather name="refresh-cw" size={15} color={darkColors.text} />
              <Text style={styles.actionLabel}>{flipped ? '查看正面' : '翻面'}</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.actionButtonDisabled]} disabled>
              <Feather name="credit-card" size={15} color={darkColors.textMuted} />
              <Text style={styles.actionLabelDisabled}>加入 Wallet（即将上线）</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

function DataTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
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
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.sm,
  },
  content: {
    alignItems: 'center',
    gap: spacing.xl,
    padding: spacing.lg,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tile: {
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    minWidth: 88,
  },
  tileValue: {
    color: darkColors.text,
    fontFamily: fontFamily.mono,
    fontSize: 18,
    fontWeight: '700',
  },
  tileLabel: {
    color: darkColors.textSecondary,
    fontFamily: fontFamily.sans,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    color: darkColors.text,
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
  },
  actionLabelDisabled: {
    color: darkColors.textMuted,
    fontFamily: fontFamily.sans,
    fontSize: 13,
  },
})
