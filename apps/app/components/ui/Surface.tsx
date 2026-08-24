import { StyleSheet, View, type ViewProps } from 'react-native'

import { colors, radius, spacing } from '@/constants/theme'

export function Surface({ style, ...props }: ViewProps) {
  return <View style={[styles.surface, style]} {...props} />
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
})
