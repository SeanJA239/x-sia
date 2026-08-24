import { Slot, usePathname } from 'expo-router'
import { StyleSheet, useWindowDimensions, View } from 'react-native'

import { AppNavBar } from '@/components/AppNavBar'
import { colors, DESKTOP_BREAKPOINT } from '@/constants/theme'

/**
 * 登录后的应用外壳。不用 Tabs 导航器——五个入口都是普通同级路由，
 * 卡片路由本身在 (app) 分组之外（app/card.tsx），这里的导航按钮只是 Link。
 * 桌面宽度切换为顶部导航，窄屏为底部导航，用同一份 AppNavBar 组件。
 */
export default function AppLayout() {
  const { width } = useWindowDimensions()
  const isDesktop = width >= DESKTOP_BREAKPOINT
  const pathname = usePathname()

  if (isDesktop) {
    return (
      <View style={styles.root}>
        <AppNavBar variant="top" activePath={pathname} />
        <View style={styles.body}>
          <Slot />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <Slot />
      </View>
      <AppNavBar variant="bottom" activePath={pathname} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  body: {
    flex: 1,
  },
})
