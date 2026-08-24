import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useCard } from '@/lib/card'
import { formatDateTime } from '@/lib/format'
import type { MyTitle } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: MyTitle[] }

export default function TitlesScreen() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [pending, setPending] = useState<string | null>(null)
  const { refresh: refreshCard } = useCard()

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await api.getMyTitles()
      setState({ status: 'ready', items: res.items })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载称号失败。',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleWear = async (title: MyTitle) => {
    setPending(title.id)
    try {
      await api.setWornTitle(title.worn ? null : title.id)
      await load()
      refreshCard()
    } catch (err) {
      setState((prev) =>
        prev.status === 'ready'
          ? prev
          : { status: 'error', message: err instanceof ApiError ? err.message : '操作失败。' },
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <AppScreen title="我的称号" withSidebar={false}>
      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : state.items.length === 0 ? (
        <Surface>
          <EmptyState message="暂无称号，社团活跃后可能会被授予哦。" />
        </Surface>
      ) : (
        <View style={styles.list}>
          {state.items.map((title) => (
            <Surface key={title.id} style={styles.row}>
              <View style={styles.rowMain}>
                <View style={styles.rowHeader}>
                  <Text style={styles.name}>{title.name}</Text>
                  {title.worn ? <Chip label="佩戴中" tone="gold" /> : null}
                </View>
                <Text style={styles.meta}>授予于 {formatDateTime(title.granted_at)}</Text>
              </View>
              <Button
                title={title.worn ? '取消佩戴' : '佩戴'}
                variant={title.worn ? 'secondary' : 'primary'}
                loading={pending === title.id}
                onPress={() => toggleWear(title)}
                style={styles.wearButton}
              />
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
    alignItems: 'center',
    gap: spacing.md,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  wearButton: {
    height: 36,
    paddingHorizontal: spacing.sm,
  },
})
