import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { colors, fontFamily, spacing } from '@/constants/theme'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.brand}>X-SIA</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.form}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    gap: spacing.xs,
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    fontFamily: fontFamily.brand,
    letterSpacing: 0.5,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
    marginBottom: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  footer: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
})
