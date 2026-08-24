import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { colors, fontFamily, spacing } from '@/constants/theme'

import { Button } from './Button'

export function LoadingState({ label = '加载中…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.text} />
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>出错了</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry ? (
        <Button title="重试" variant="secondary" onPress={onRetry} style={styles.retryButton} />
      ) : null}
    </View>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  errorMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    fontFamily: fontFamily.sans,
  },
  emptyMessage: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  retryButton: {
    marginTop: spacing.sm,
  },
})
