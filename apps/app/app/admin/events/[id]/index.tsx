import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'

import { AdminShell } from '@/components/AdminShell'
import { EventForm } from '@/components/EventForm'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { AdminMember, EventAdminDetail, EventAttendanceItem } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; event: EventAdminDetail; attendance: EventAttendanceItem[] }

export default function ManageEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [members, setMembers] = useState<AdminMember[]>([])
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setState({ status: 'loading' })
    try {
      const [event, attendanceRes] = await Promise.all([
        api.admin.getEvent(id),
        api.admin.getEventAttendance(id),
      ])
      setState({ status: 'ready', event, attendance: attendanceRes.items })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载活动详情失败。',
      })
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.admin
      .listMembers()
      .then((res) => setMembers(res.items))
      .catch(() => {})
  }, [])

  const matches = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return members
      .filter(
        (m) =>
          m.user.display_name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [members, query])

  const recordManual = async (userId: string) => {
    if (!id) return
    setRecording(userId)
    try {
      await api.admin.recordAttendance(id, userId)
      setQuery('')
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'member_not_active') {
        Alert.alert('补录失败', '该成员当前不是在册状态，需先激活会员资格才能补录签到。')
      } else {
        Alert.alert('补录失败', err instanceof ApiError ? err.message : '请稍后重试。')
      }
    } finally {
      setRecording(null)
    }
  }

  if (state.status === 'loading') {
    return (
      <AdminShell title="管理活动">
        <LoadingState />
      </AdminShell>
    )
  }

  if (state.status === 'error') {
    return (
      <AdminShell title="管理活动">
        <ErrorState message={state.message} onRetry={load} />
      </AdminShell>
    )
  }

  return (
    <AdminShell title={state.event.title}>
      <Button
        title="打开签到大屏"
        variant="secondary"
        onPress={() =>
          router.push({ pathname: '/admin/events/[id]/screen', params: { id: state.event.id } })
        }
        style={styles.screenButton}
      />

      <Surface>
        <Text style={styles.sectionTitle}>编辑活动</Text>
        <EventForm
          initial={state.event}
          submitLabel="保存"
          onSubmit={async (input) => {
            await api.admin.updateEvent(state.event.id, input)
            await load()
          }}
        />
      </Surface>

      <Surface>
        <Text style={styles.sectionTitle}>手动补录签到</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索姓名或邮箱"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
        {matches.map((m) => (
          <View key={m.id} style={styles.matchRow}>
            <Text style={styles.matchName}>
              {m.user.display_name} · {m.user.email}
            </Text>
            <Button
              title="补录"
              variant="secondary"
              loading={recording === m.user.id}
              onPress={() => recordManual(m.user.id)}
              style={styles.recordButton}
            />
          </View>
        ))}
      </Surface>

      <Surface>
        <Text style={styles.sectionTitle}>签到名单（{state.attendance.length}）</Text>
        {state.attendance.length === 0 ? (
          <EmptyState message="暂无人签到。" />
        ) : (
          <View style={styles.list}>
            {state.attendance.map((a) => (
              <View key={a.user.id} style={styles.attendanceRow}>
                <Text style={styles.attendanceName}>
                  {a.user.display_name}
                  {a.member_no != null ? ` · #${a.member_no}` : ''}
                </Text>
                <Text style={styles.attendanceMeta}>
                  {formatDateTime(a.checked_in_at)} · {a.method === 'manual' ? '手动补录' : '扫码'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Surface>
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  screenButton: {
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
    marginBottom: spacing.sm,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  matchName: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fontFamily.sans,
    flex: 1,
  },
  recordButton: {
    height: 32,
    paddingHorizontal: spacing.sm,
  },
  list: {
    gap: spacing.xs,
  },
  attendanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  attendanceName: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  attendanceMeta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.mono,
  },
})
