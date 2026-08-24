import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { AppScreen } from '@/components/AppScreen'
import { Chip } from '@/components/ui/Chip'
import { ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/lib/auth'
import { useCard } from '@/lib/card'

export default function ProfileScreen() {
  const { state: authState, logout } = useAuth()
  const { state: cardState, refresh } = useCard()
  const router = useRouter()

  if (authState.status !== 'signedIn') return null

  const onLogout = async () => {
    await logout()
  }

  return (
    <AppScreen title="我的" withSidebar={false}>
      <Surface style={styles.identityCard}>
        <View style={styles.avatar}>
          <Feather name="user" size={28} color={colors.textMuted} />
        </View>
        <Text style={styles.name}>{authState.user.display_name}</Text>
        <View style={styles.chipRow}>
          {authState.membership.member_no != null ? (
            <Chip label={`#${authState.membership.member_no}`} tone="gold" mono />
          ) : null}
          {cardState.status === 'ready' && cardState.data.title ? (
            <Chip label={cardState.data.title} tone="neutral" />
          ) : null}
        </View>
        <Text style={styles.email}>{authState.user.email}</Text>
      </Surface>

      <Surface style={styles.qrCard}>
        <Text style={styles.qrCardTitle}>身份二维码</Text>
        {cardState.status === 'loading' || cardState.status === 'idle' ? (
          <LoadingState label="生成中…" />
        ) : cardState.status === 'error' ? (
          <ErrorState message={cardState.message} onRetry={refresh} />
        ) : (
          <>
            <View style={styles.qrBox}>
              <QRCode value={cardState.data.qr_payload} size={160} />
            </View>
            <Text style={styles.qrHint}>仅用于人工核验，不作签到凭证</Text>
          </>
        )}
      </Surface>

      <Surface style={styles.menu}>
        <MenuRow icon="award" label="我的权益" onPress={() => router.push('/entitlements')} />
        <MenuRow
          icon="file-text"
          label="我的证书"
          onPress={() => Alert.alert('即将上线', '证书功能正在建设中。')}
        />
        <MenuRow
          icon="check-circle"
          label="出勤记录"
          onPress={() => Alert.alert('即将上线', '出勤记录功能正在建设中。')}
        />
        <MenuRow icon="log-out" label="退出登录" onPress={onLogout} destructive last />
      </Surface>
    </AppScreen>
  )
}

function MenuRow({
  icon,
  label,
  onPress,
  destructive = false,
  last = false,
}: {
  icon: keyof typeof Feather.glyphMap
  label: string
  onPress: () => void
  destructive?: boolean
  last?: boolean
}) {
  return (
    <Pressable onPress={onPress} style={[styles.menuRow, !last && styles.menuRowDivider]}>
      <Feather name={icon} size={16} color={destructive ? colors.danger : colors.text} />
      <Text style={[styles.menuLabel, destructive && styles.menuLabelDestructive]}>{label}</Text>
      {!destructive ? <Feather name="chevron-right" size={16} color={colors.textMuted} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  identityCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  email: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  qrCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  qrCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
    alignSelf: 'flex-start',
  },
  qrBox: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
  },
  qrHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  menu: {
    padding: 0,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  menuLabelDestructive: {
    color: colors.danger,
  },
})
