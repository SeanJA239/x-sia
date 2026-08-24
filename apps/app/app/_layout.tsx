import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet, View } from 'react-native'

import { ErrorState, LoadingState } from '@/components/ui/StateViews'
import { colors } from '@/constants/theme'
import { AuthProvider, useAuth } from '@/lib/auth'
import { CardProvider } from '@/lib/card'

export const unstable_settings = {
  initialRouteName: '(auth)',
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootLayoutNav />
    </AuthProvider>
  )
}

function RootLayoutNav() {
  const { state, isAdmin, retryBoot } = useAuth()

  if (state.status === 'loading') {
    return (
      <View style={styles.boot}>
        <LoadingState label="正在加载 X-SIA…" />
      </View>
    )
  }

  if (state.status === 'bootError') {
    return (
      <View style={styles.boot}>
        <ErrorState message={state.message} onRetry={retryBoot} />
      </View>
    )
  }

  const signedIn = state.status === 'signedIn'

  return (
    <CardProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="card" options={{ animation: 'fade' }} />
          <Stack.Protected guard={isAdmin}>
            <Stack.Screen name="admin" />
          </Stack.Protected>
        </Stack.Protected>

        <Stack.Screen name="u/[id]" />
        <Stack.Screen name="verify/[serial]" />
        <Stack.Screen name="checkin" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </CardProvider>
  )
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.paper,
  },
})
