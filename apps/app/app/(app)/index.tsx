import { StyleSheet, Text } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { StatusBanner } from '@/components/StatusBanner'
import { EmptyState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily } from '@/constants/theme'
import { useAuth } from '@/lib/auth'

export default function HomeScreen() {
  const { state } = useAuth()
  const displayName = state.status === 'signedIn' ? state.user.display_name : ''

  return (
    <AppScreen title={`你好，${displayName}`}>
      {state.status === 'signedIn' ? <StatusBanner status={state.membership.status} /> : null}

      <Surface>
        <Text style={styles.feedTitle}>内容流</Text>
        <EmptyState message="社员发帖功能筹备中，敬请期待。" />
      </Surface>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  feedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
    marginBottom: 8,
  },
})
