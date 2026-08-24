import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { Sidebar } from '@/components/Sidebar'
import { colors, DESKTOP_BREAKPOINT, fontFamily, spacing } from '@/constants/theme'

/**
 * 五个 in-app 页面共用的响应式外壳：桌面宽度（≥880px）展示内容流 + 右侧栏双栏，
 * 窄屏展示单栏内容。导航本身在 AppNavBar 中，与这里的双栏无关。
 */
export function AppScreen({
  title,
  children,
  withSidebar = true,
}: {
  title: string
  children: ReactNode
  withSidebar?: boolean
}) {
  const { width } = useWindowDimensions()
  const isDesktop = width >= DESKTOP_BREAKPOINT

  const content = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}
    >
      <Text style={styles.title}>{title}</Text>
      {children}
    </ScrollView>
  )

  if (!isDesktop) {
    return <View style={styles.mobileRoot}>{content}</View>
  }

  return (
    <View style={styles.desktopRoot}>
      <View style={styles.desktopMain}>{content}</View>
      {withSidebar ? (
        <View style={styles.desktopSidebar}>
          <Sidebar />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  mobileRoot: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.paper,
  },
  desktopMain: {
    flex: 1,
  },
  desktopSidebar: {
    padding: spacing.xl,
    paddingLeft: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  scrollContentDesktop: {
    padding: spacing.xl,
    maxWidth: 720,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
})
