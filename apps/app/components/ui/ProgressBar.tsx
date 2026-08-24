import { StyleSheet, View } from 'react-native'

import { colors, radius } from '@/constants/theme'

export function ProgressBar({ pct, tone = colors.link }: { pct: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: tone }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
})
