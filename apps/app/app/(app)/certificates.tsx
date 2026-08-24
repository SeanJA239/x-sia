import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { Certificate } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: Certificate[] }

export default function CertificatesScreen() {
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await api.getMyCertificates()
      setState({ status: 'ready', items: res.items })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载证书失败。',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppScreen title="我的证书" withSidebar={false}>
      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : state.items.length === 0 ? (
        <Surface>
          <EmptyState message="暂无证书。" />
        </Surface>
      ) : (
        <View style={styles.list}>
          {state.items.map((cert) => (
            <Surface key={cert.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.eventTitle}>{cert.event.title}</Text>
                <Text style={styles.serial}>{cert.serial}</Text>
                <Text style={styles.meta}>签发于 {formatDateTime(cert.issued_at)}</Text>
              </View>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/verify/[serial]', params: { serial: cert.serial } })
                }
              >
                <Text style={styles.verifyLink}>验证链接 →</Text>
              </Pressable>
            </Surface>
          ))}
        </View>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowMain: {
    gap: 2,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  serial: {
    fontSize: 13,
    color: colors.numberGold,
    fontFamily: fontFamily.mono,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  verifyLink: {
    fontSize: 13,
    color: colors.link,
    fontFamily: fontFamily.sans,
    fontWeight: '600',
  },
})
