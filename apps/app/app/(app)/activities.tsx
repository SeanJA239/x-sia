import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatDateRange } from '@/lib/format'
import type { EventItem } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: EventItem[] }

export default function ActivitiesScreen() {
  const { isAdmin } = useAuth()
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await api.listEvents()
      setState({ status: 'ready', items: res.items })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载活动列表失败。',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const now = Date.now()
  const groups =
    state.status === 'ready'
      ? {
          ongoing: state.items.filter(
            (e) => new Date(e.starts_at).getTime() <= now && new Date(e.ends_at).getTime() >= now,
          ),
          upcoming: state.items.filter((e) => new Date(e.starts_at).getTime() > now),
          past: state.items.filter((e) => new Date(e.ends_at).getTime() < now),
        }
      : null

  return (
    <AppScreen title="活动">
      {isAdmin ? (
        <Button
          title="创建活动"
          variant="secondary"
          onPress={() => router.push('/admin/events/new')}
          style={styles.createButton}
        />
      ) : null}

      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : state.items.length === 0 ? (
        <Surface>
          <EmptyState message="暂无活动。" />
        </Surface>
      ) : (
        groups && (
          <>
            <EventGroup
              title="进行中"
              items={groups.ongoing}
              isAdmin={isAdmin}
              onManage={(id) => router.push({ pathname: '/admin/events/[id]', params: { id } })}
            />
            <EventGroup
              title="未来"
              items={groups.upcoming}
              isAdmin={isAdmin}
              onManage={(id) => router.push({ pathname: '/admin/events/[id]', params: { id } })}
            />
            <EventGroup
              title="已结束"
              items={groups.past}
              isAdmin={isAdmin}
              onManage={(id) => router.push({ pathname: '/admin/events/[id]', params: { id } })}
            />
          </>
        )
      )}
    </AppScreen>
  )
}

function EventGroup({
  title,
  items,
  isAdmin,
  onManage,
}: {
  title: string
  items: EventItem[]
  isAdmin: boolean
  onManage: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.list}>
        {items.map((event) => (
          <Surface key={event.id} style={styles.row}>
            <View style={styles.rowMain}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{event.title}</Text>
                {event.checked_in ? <Chip label="已签到" tone="success" /> : null}
              </View>
              <Text style={styles.rowMeta}>{formatDateRange(event.starts_at, event.ends_at)}</Text>
              <Text style={styles.rowMeta}>{event.location}</Text>
            </View>
            {isAdmin ? (
              <Button
                title="管理"
                variant="secondary"
                onPress={() => onManage(event.id)}
                style={styles.manageButton}
              />
            ) : null}
          </Surface>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  createButton: {
    alignSelf: 'flex-start',
  },
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
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
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  manageButton: {
    height: 32,
    paddingHorizontal: spacing.sm,
  },
})
