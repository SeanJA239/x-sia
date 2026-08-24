import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native'

import { colors, fontFamily, radius, spacing } from '@/constants/theme'

type Variant = 'primary' | 'secondary' | 'ghost'

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  title: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}) {
  const isDisabled = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.buttonText : colors.text} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'primary' && styles.textPrimary,
            variant !== 'primary' && styles.textSecondary,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: {
    backgroundColor: colors.buttonBg,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fontFamily.sans,
  },
  textPrimary: {
    color: colors.buttonText,
  },
  textSecondary: {
    color: colors.text,
  },
})
