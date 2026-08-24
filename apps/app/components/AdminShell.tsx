import { Feather } from '@expo/vector-icons'
import { type Href, useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { colors, fontFamily, spacing } from '@/constants/theme'

/** admin 子页面共用的外壳：返回链接 + 标题 + 定宽内容区，风格与 /admin 首页一致。 */
export function AdminShell({
  title,
  backHref = '/admin',
  children,
}: {
  title: string
  backHref?: Href
  children: ReactNode
}) {
  const router = useRouter()
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push(backHref)} style={styles.backRow} hitSlop={8}>
        <Feather name="arrow-left" size={14} color={colors.textSecondary} />
        <Text style={styles.backLabel}>返回管理后台</Text>
      </Pressable>
      <Text style={styles.pageTitle}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  body: {
    gap: spacing.lg,
  },
})
