import { Feather } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { WikiNavLink } from '@/components/WikiNavLink'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/lib/auth'

type NavItem = {
  href: '/' | '/activities' | '/card' | '/wiki/' | '/resources' | '/profile'
  label: string
  icon: keyof typeof Feather.glyphMap
  raised?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '首页', icon: 'home' },
  { href: '/activities', label: '活动', icon: 'calendar' },
  { href: '/card', label: '卡片', icon: 'credit-card', raised: true },
  { href: '/wiki/', label: 'Wiki', icon: 'book-open' },
  { href: '/resources', label: '资源', icon: 'folder' },
  { href: '/profile', label: '我的', icon: 'user' },
]

export function AppNavBar({
  variant,
  activePath,
}: {
  variant: 'top' | 'bottom'
  activePath: string
}) {
  const insets = useSafeAreaInsets()
  const { isAdmin } = useAuth()

  if (variant === 'top') {
    return (
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Text style={styles.brand}>X-SIA</Text>
        <View style={styles.topLinks}>
          {NAV_ITEMS.map((item) => {
            if (item.href === '/wiki/') return <WikiNavLink key={item.href} variant="top" />
            const active = activePath === item.href
            return (
              <Link key={item.href} href={item.href} asChild>
                <Pressable accessibilityLabel={item.label} style={styles.topLinkItem}>
                  <Feather
                    name={item.icon}
                    size={15}
                    color={active ? colors.text : colors.textSecondary}
                  />
                  <Text style={[styles.topLinkLabel, active && styles.topLinkLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              </Link>
            )
          })}
        </View>
        <View style={styles.topRight}>
          {isAdmin ? (
            <Link href="/admin" asChild>
              <Pressable style={styles.adminPill}>
                <Text style={styles.adminPillLabel}>管理后台</Text>
              </Pressable>
            </Link>
          ) : (
            <View style={styles.topRightSpacer} />
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {NAV_ITEMS.map((item) => {
        if (item.href === '/wiki/') return <WikiNavLink key={item.href} variant="bottom" />
        const active = activePath === item.href
        if (item.raised) {
          return (
            <Link key={item.href} href={item.href} asChild>
              <Pressable accessibilityLabel={item.label} style={styles.raisedWrap}>
                <View style={styles.raisedButton}>
                  <Feather name={item.icon} size={20} color={colors.buttonText} />
                </View>
                <Text style={styles.bottomLabel}>{item.label}</Text>
              </Pressable>
            </Link>
          )
        }
        return (
          <Link key={item.href} href={item.href} asChild>
            <Pressable accessibilityLabel={item.label} style={styles.bottomItem}>
              <Feather name={item.icon} size={20} color={active ? colors.text : colors.textMuted} />
              <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          </Link>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: spacing.xl,
  },
  brand: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: fontFamily.brand,
    color: colors.text,
    letterSpacing: 0.5,
  },
  topLinks: {
    flexDirection: 'row',
    gap: spacing.lg,
    flex: 1,
  },
  topLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  topLinkLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
    fontWeight: '500',
  },
  topLinkLabelActive: {
    color: colors.text,
    fontWeight: '700',
  },
  topRight: {
    minWidth: 1,
  },
  topRightSpacer: {
    width: 1,
  },
  adminPill: {
    backgroundColor: colors.buttonBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  adminPillLabel: {
    color: colors.buttonText,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fontFamily.sans,
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: spacing.sm,
  },
  bottomItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  bottomLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  bottomLabelActive: {
    color: colors.text,
    fontWeight: '600',
  },
  raisedWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  raisedButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.buttonBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
})
