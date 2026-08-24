import { useEffect, useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/ui/Button'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { formatDateRange } from '@/lib/format'
import type { AdminMember, EventItem } from '@/lib/types'

export function IssueCertificateModal({
  member,
  onClose,
}: {
  member: AdminMember | null
  onClose: () => void
}) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (member) {
      api
        .listEvents()
        .then((res) => setEvents(res.items))
        .catch(() => {})
    }
  }, [member])

  if (!member) return null

  const issue = async (event: EventItem) => {
    setBusy(true)
    try {
      const cert = await api.admin.issueCertificate(member.user.id, event.id)
      Alert.alert('签发成功', `编号：${cert.serial}`)
      onClose()
    } catch (err) {
      Alert.alert('签发失败', err instanceof ApiError ? err.message : '请稍后重试。')
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
