import { Feather } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { MemberCard } from '@/components/MemberCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { useAuth } from '@/lib/auth'
import { useCard } from '@/lib/card'

/** 桌面双栏布局的右侧栏：迷你会员卡、AI 额度、下一场活动占位。 */
export function Sidebar() {
  const { state: authState } = useAuth()
  const { state: cardState } = useCard()

  return (
    <View style={styles.container}>
      <Surface style={styles.cardSurface}>
        <Link href="/card" asChild>
          <Pressable style={styles.cardPressable}>
            {cardState.status === 'ready' ? (
              <MemberCard data={cardState.data} size="mini" interactive={false} />
            ) : (
              <View style={styles.cardPlaceholder} />
            )}
          </Pressable>
        </Link>
        <Link href="/card" asChild>
          <Pressable>
            <Text style={styles.cardLink}>查看完整会员卡 →</Text>
          </Pressable>
        </Link>
      </Surface>

      <Surface style={styles.quotaSurface}>
        <Text style={styles.sectionTitle}>AI 额度</Text>
        {authState.status === 'signedIn' ? (
          <>
            <Text style={styles.quotaNumber}>
              {authState.quota.remaining}
              <Text style={styles.quotaUnit}> / {authState.quota.daily_limit}</Text>
            </Text>
            <ProgressBar
              pct={(authState.quota.remaining / Math.max(authState.quota.daily_limit, 1)) * 100}
            />
            <Text style={styles.quotaHint}>今日已用 {authState.quota.used_today}</Text>
          </>
        ) : (
          <Text style={styles.quotaHint}>登录后查看额度</Text>
        )}
      </Surface>

      <Surface style={styles.eventSurface}>
        <View style={styles.eventHeader}>
          <Feather name="calendar" size={14} color={colors.textSecondary} />
          <Text style={styles.sectionTitle}>下一场活动</Text>
        </View>
        <Text style={styles.eventPlaceholder}>暂无排期，敬请期待</Text>
      </Surface>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 280,
    gap: spacing.md,
  },
  cardSurface: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  cardPressable: {
    alignItems: 'center',
  },
  cardPlaceholder: {
    width: 176,
    height: 111,
    borderRadius: 18,
    backgroundColor: colors.hairline,
  },
  cardLink: {
    fontSize: 12,
    color: colors.link,
    fontFamily: fontFamily.sans,
    fontWeight: '600',
  },
  quotaSurface: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  quotaNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.mono,
  },
  quotaUnit: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: fontFamily.mono,
    fontWeight: '400',
  },
  quotaHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  eventSurface: {
    gap: spacing.xs,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventPlaceholder: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
})
