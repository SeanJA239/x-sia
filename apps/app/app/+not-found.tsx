import { Link, Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { colors, fontFamily, spacing } from '@/constants/theme'

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '页面不存在' }} />
      <View style={styles.container}>
        <Text style={styles.title}>这个页面不存在</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>返回首页</Text>
        </Link>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.paper,
    gap: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  link: {
    paddingVertical: spacing.sm,
  },
  linkText: {
    fontSize: 14,
    color: colors.link,
    fontFamily: fontFamily.sans,
    fontWeight: '600',
  },
})
