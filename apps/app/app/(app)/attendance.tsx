import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { MyAttendanceItem } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: MyAttendanceItem[] }

export default function AttendanceScreen() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await api.getMyAttendance()
      setState({ status: 'ready', items: res.items })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载出勤记录失败。',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppScreen title="出勤记录" withSidebar={false}>
      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : state.items.length === 0 ? (
        <Surface>
          <EmptyState message="暂无出勤记录。" />
        </Surface>
      ) : (
        <View style={styles.list}>
          {state.items.map((a) => (
            <Surface key={`${a.event.id}-${a.checked_in_at}`} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.eventTitle}>{a.event.title}</Text>
                <Text style={styles.meta}>活动时间 {formatDateTime(a.event.starts_at)}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.checkedInAt}>{formatDateTime(a.checked_in_at)}</Text>
                <Text style={styles.method}>{a.method === 'manual' ? '手动补录' : '扫码签到'}</Text>
              </View>
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
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  checkedInAt: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fontFamily.mono,
  },
  method: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
})
