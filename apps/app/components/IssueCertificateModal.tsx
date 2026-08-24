import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/ui/Button'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useDialog } from '@/lib/dialog'
import { formatDateRange } from '@/lib/format'
import type { AdminMember, EventItem } from '@/lib/types'

export function IssueCertificateModal({
  member,
  onClose,
}: {
  member: AdminMember | null
  onClose: () => void
}) {
  const { alert } = useDialog()
  const [events, setEvents] = useState<EventItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (member) {
      setError(null)
      api
        .listEvents()
        .then((res) => setEvents(res.items))
        .catch(() => {})
    }
  }, [member])

  if (!member) return null

  const issue = async (event: EventItem) => {
    setBusy(true)
    setError(null)
    try {
      const cert = await api.admin.issueCertificate(member.user.id, event.id)
      onClose()
      // 见 GrantTitleModal 的同款注释：必须先 onClose() 再 alert()，
      // 否则这个 modal 还开着会盖住 alert，按钮点不到。
      alert({ title: '签发成功', body: `编号：${cert.serial}` })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '签发失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>给 {member.user.display_name} 签发证书</Text>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>暂无活动，请先创建活动。</Text>
          ) : (
            events.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => issue(event)}
                style={styles.optionRow}
                disabled={busy}
              >
                <Text style={styles.optionLabel}>{event.title}</Text>
                <Text style={styles.optionMeta}>
                  {formatDateRange(event.starts_at, event.ends_at)}
                </Text>
              </Pressable>
            ))
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button title="取消" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    fontFamily: fontFamily.sans,
  },
  optionRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  optionMeta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
})
