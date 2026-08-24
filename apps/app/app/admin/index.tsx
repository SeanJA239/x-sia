import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { GrantTitleModal } from '@/components/GrantTitleModal'
import { IssueCertificateModal } from '@/components/IssueCertificateModal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import type { AdminMember, MembershipStatus } from '@/lib/types'

const STATUS_LABEL: Record<
  MembershipStatus,
  { label: string; tone: 'neutral' | 'gold' | 'success' | 'warning' | 'danger' }
> = {
  applied: { label: '报名中', tone: 'warning' },
  pending_payment: { label: '待缴费', tone: 'warning' },
  active: { label: '在册', tone: 'success' },
  expired: { label: '已过期', tone: 'neutral' },
  revoked: { label: '已取消', tone: 'danger' },
  reviewing: { label: '审核中', tone: 'neutral' },
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: AdminMember[] }

export default function AdminScreen() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [grantTitleMember, setGrantTitleMember] = useState<AdminMember | null>(null)
  const [issueCertMember, setIssueCertMember] = useState<AdminMember | null>(null)

  const load = useCallback(async (filters: { term?: string; q?: string } = {}) => {
    setState({ status: 'loading' })
    try {
      const res = await api.admin.listMembers(filters)
      setState({ status: 'ready', items: res.items })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载成员列表失败。',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onFilter = () => {
    load({ term: term.trim() || undefined, q: query.trim() || undefined })
  }

  const paidNotInGroup = useMemo(() => {
    if (state.status !== 'ready') return 0
    return state.items.filter((m) => m.paid_confirmed_at && !m.in_group_at).length
  }, [state])

  const runAction = async (mid: string, action: 'verify' | 'confirm-paid' | 'confirm-group') => {
    setPendingAction(`${mid}:${action}`)
    try {
      if (action === 'verify') await api.admin.verify(mid)
      if (action === 'confirm-paid') await api.admin.confirmPaid(mid)
      if (action === 'confirm-group') await api.admin.confirmGroup(mid)
      await load({ term: term.trim() || undefined, q: query.trim() || undefined })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '操作失败，请重试。'
      Alert.alert('操作失败', message)
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>管理后台</Text>

      {paidNotInGroup > 0 ? (
        <Surface style={styles.alertBanner}>
          <Text style={styles.alertText}>{paidNotInGroup} 人已缴费未进群</Text>
        </Surface>
      ) : null}

      <View style={styles.filters}>
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="按届筛选，如 2026"
          placeholderTextColor={colors.textMuted}
          style={styles.filterInput}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索姓名或邮箱"
          placeholderTextColor={colors.textMuted}
          style={styles.filterInput}
        />
        <Button title="筛选" variant="secondary" onPress={onFilter} />
      </View>

      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={() => load()} />
      ) : (
        <Surface style={styles.tableCard}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.cell, styles.cellName, styles.headerText]}>姓名</Text>
            <Text style={[styles.cell, styles.cellEmail, styles.headerText]}>邮箱</Text>
            <Text style={[styles.cell, styles.cellNo, styles.headerText]}>编号</Text>
            <Text style={[styles.cell, styles.cellStatus, styles.headerText]}>状态</Text>
            <Text style={[styles.cell, styles.cellFlag, styles.headerText]}>缴费</Text>
            <Text style={[styles.cell, styles.cellFlag, styles.headerText]}>进群</Text>
            <Text style={[styles.cell, styles.cellActions, styles.headerText]}>操作</Text>
          </View>
          {state.items.map((member) => {
            const statusMeta = STATUS_LABEL[member.status] ?? {
              label: member.status,
              tone: 'neutral' as const,
            }
            return (
              <View key={member.id} style={styles.tableRow}>
                <Text style={[styles.cell, styles.cellName]} numberOfLines={1}>
                  {member.user.display_name}
                </Text>
                <Text style={[styles.cell, styles.cellEmail]} numberOfLines={1}>
                  {member.user.email}
                </Text>
                <Text style={[styles.cell, styles.cellNo, styles.mono]}>
                  {member.member_no != null ? `#${member.member_no}` : '—'}
                </Text>
                <View style={styles.cellStatus}>
                  <Chip label={statusMeta.label} tone={statusMeta.tone} />
                </View>
                <View style={styles.cellFlag}>
                  <Chip
                    label={member.paid_confirmed_at ? '已缴费' : '未缴费'}
                    tone={member.paid_confirmed_at ? 'success' : 'neutral'}
                  />
                </View>
                <View style={styles.cellFlag}>
                  <Chip
                    label={member.in_group_at ? '已进群' : '未进群'}
                    tone={member.in_group_at ? 'success' : 'neutral'}
                  />
                </View>
                <View style={styles.cellActions}>
                  {member.status === 'applied' ? (
                    <Button
                      title="确认核验"
                      variant="secondary"
                      loading={pendingAction === `${member.id}:verify`}
                      onPress={() => runAction(member.id, 'verify')}
                      style={styles.actionButton}
                    />
                  ) : null}
                  {!member.paid_confirmed_at ? (
                    <Button
                      title="确认缴费"
                      variant="secondary"
                      loading={pendingAction === `${member.id}:confirm-paid`}
                      onPress={() => runAction(member.id, 'confirm-paid')}
                      style={styles.actionButton}
                    />
                  ) : null}
                  {!member.in_group_at ? (
                    <Button
                      title="确认进群"
                      variant="secondary"
                      loading={pendingAction === `${member.id}:confirm-group`}
                      onPress={() => runAction(member.id, 'confirm-group')}
                      style={styles.actionButton}
                    />
                  ) : null}
                  <Button
                    title="授予 title"
                    variant="secondary"
                    onPress={() => setGrantTitleMember(member)}
                    style={styles.actionButton}
                  />
                  <Button
                    title="签发证书"
                    variant="secondary"
                    onPress={() => setIssueCertMember(member)}
                    style={styles.actionButton}
                  />
                </View>
              </View>
            )
          })}
        </Surface>
      )}

      <GrantTitleModal
        member={grantTitleMember}
        onClose={() => setGrantTitleMember(null)}
        onGranted={() => load({ term: term.trim() || undefined, q: query.trim() || undefined })}
      />
      <IssueCertificateModal member={issueCertMember} onClose={() => setIssueCertMember(null)} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  alertBanner: {
    backgroundColor: '#F7EEDF',
    borderColor: '#EBD9B5',
    padding: spacing.md,
  },
  alertText: {
    color: colors.warning,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterInput: {
    height: 40,
    minWidth: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: colors.text,
  },
  tableCard: {
    padding: 0,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: spacing.sm,
  },
  tableHeaderRow: {
    backgroundColor: colors.paper,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  cell: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: colors.text,
  },
  cellName: { width: 120 },
  cellEmail: { width: 200 },
  cellNo: { width: 70 },
  cellStatus: { width: 90 },
  cellFlag: { width: 90 },
  cellActions: { flex: 1, flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  mono: {
    fontFamily: fontFamily.mono,
  },
  actionButton: {
    height: 32,
    paddingHorizontal: spacing.sm,
  },
})
