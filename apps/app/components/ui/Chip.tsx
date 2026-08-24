import { StyleSheet, Text, View } from 'react-native'

import { colors, fontFamily, radius } from '@/constants/theme'

type Tone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger'

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.hairline, fg: colors.textSecondary },
  gold: { bg: colors.numberGoldBg, fg: colors.numberGold },
  success: { bg: '#E4F5EC', fg: colors.success },
  warning: { bg: '#F7EEDF', fg: colors.warning },
  danger: { bg: '#F8E5E3', fg: colors.danger },
}

export function Chip({
  label,
  tone = 'neutral',
  mono = false,
}: {
  label: string
  tone?: Tone
  mono?: boolean
}) {
  const t = TONE_STYLES[tone]
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <Text
        style={[
          styles.label,
          { color: t.fg },
          mono ? { fontFamily: fontFamily.mono } : { fontFamily: fontFamily.sans },
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
})
