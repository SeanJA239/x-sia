import { Feather } from '@expo/vector-icons'
import { type Href, Link } from 'expo-router'
import { Pressable, StyleSheet, Text } from 'react-native'

import { colors, fontFamily } from '@/constants/theme'

/** 原生端只在配置可访问的 Wiki 公网地址后展示；Web 使用同名 .web.tsx。 */
export function WikiNavLink({ variant }: { variant: 'top' | 'bottom' }) {
  const url = process.env.EXPO_PUBLIC_WIKI_URL
  if (!url || !/^https?:\/\//.test(url)) return null
  const bottom = variant === 'bottom'
  return (
    <Link href={url as Href} asChild>
      <Pressable style={[styles.link, bottom && styles.bottom]}>
        <Feather name="book-open" size={bottom ? 20 : 15} color={colors.textSecondary} />
        <Text style={[styles.label, bottom && styles.bottomLabel]}>Wiki</Text>
      </Pressable>
    </Link>
  )
}
const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  bottom: { flex: 1, flexDirection: 'column', gap: 2, paddingVertical: 0 },
  label: { color: colors.textSecondary, fontFamily: fontFamily.sans, fontSize: 14 },
  bottomLabel: { fontSize: 11 },
})
