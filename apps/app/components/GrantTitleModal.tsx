import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { Button } from '@/components/ui/Button'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useDialog } from '@/lib/dialog'
import type { AdminMember, TitleDef } from '@/lib/types'

export function GrantTitleModal({
  member,
  onClose,
  onGranted,
}: {
  member: AdminMember | null
  onClose: () => void
  onGranted: () => void
}) {
  const { alert } = useDialog()
  const [titleDefs, setTitleDefs] = useState<TitleDef[]>([])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (member) {
      setError(null)
      api
        .listTitleDefs()
        .then((res) => setTitleDefs(res.items))
        .catch(() => {})
    }
  }, [member])

  if (!member) return null

  const grant = async (defId: string) => {
    setBusy(true)
    setError(null)
    try {
      const granted = await api.admin.grantTitle(member.user.id, defId)
      onGranted()
      onClose()
      // 弹窗在这里才 alert：react-native-web 的 Modal 没有 zIndex，堆叠顺序按 DOM
      // 挂载先后决定，DialogProvider 的弹窗在应用启动时就挂载了，若这个 modal 还开着，
      // 它会盖在 alert 上面，导致「好的」按钮点不到——所以成功提示必须等 onClose() 之后。
      alert({
        title: '授予成功',
        body: `已将「${granted.name}」授予 ${member.user.display_name}。`,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '授予失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const createDef = async () => {
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    try {
      const def = await api.admin.createTitleDef(newName.trim())
      setTitleDefs((prev) => [...prev, def])
      setNewName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>授予称号给 {member.user.display_name}</Text>
          {titleDefs.length === 0 ? (
            <Text style={styles.emptyText}>暂无称号定义，先在下面新建一个。</Text>
          ) : (
            titleDefs.map((def) => (
              <Pressable
                key={def.id}
                onPress={() => grant(def.id)}
                style={styles.optionRow}
                disabled={busy}
              >
                <Text style={styles.optionLabel}>{def.name}</Text>
              </Pressable>
            ))
          )}
          <View style={styles.newRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="新称号名称"
              placeholderTextColor={colors.textMuted}
              style={styles.newInput}
            />
            <Button
              title="新建"
              variant="secondary"
              onPress={createDef}
              loading={busy}
              style={styles.newButton}
            />
          </View>
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
  },
  optionLabel: {
    fontSize: 14,
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  newRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  newInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: colors.text,
  },
  newButton: {
    height: 40,
    paddingHorizontal: spacing.sm,
  },
})
