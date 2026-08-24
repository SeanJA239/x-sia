import { Feather } from '@expo/vector-icons'
import { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import type { PickedFile } from '@/components/FilePicker'
import { FilePicker } from '@/components/FilePicker'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDialog } from '@/lib/dialog'
import { formatFileSize, mimeLabel } from '@/lib/format'
import type { ResourceItem } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ResourceItem[] }

export default function ResourcesScreen() {
  const { state: authState } = useAuth()
  const { alert } = useDialog()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const isActiveMember = authState.status === 'signedIn' && authState.membership.status === 'active'

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await api.listResources()
      setState({ status: 'ready', items: res.items })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载资源列表失败。',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onDownload = async (item: ResourceItem) => {
    try {
      const { url } = await api.getResourceDownloadUrl(item.id)
      await Linking.openURL(url)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '获取下载链接失败，请稍后重试。'
      alert({ title: '下载失败', body: message })
    }
  }

  return (
    <AppScreen title="资源" withSidebar={false}>
      {isActiveMember ? <UploadForm onUploaded={load} /> : null}

      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : state.items.length === 0 ? (
        <Surface>
          <EmptyState message="暂无可用资源。" />
        </Surface>
      ) : (
        <View style={styles.list}>
          {state.items.map((item) => (
            <Surface key={item.id} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.rowMeta}>
                  <Chip label={mimeLabel(item.mime)} />
                  <Text style={styles.metaText}>{formatFileSize(item.size)}</Text>
                  <Text style={styles.metaText}>· {item.uploader.display_name}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => onDownload(item)}
                style={styles.downloadButton}
                accessibilityRole="button"
                accessibilityLabel={`下载 ${item.title}`}
              >
                <Feather name="download" size={16} color={colors.text} />
              </Pressable>
            </Surface>
          ))}
        </View>
      )}
    </AppScreen>
  )
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [title, setTitle] = useState('')
  const [visibility, setVisibility] = useState<'member' | 'public'>('member')
  const [file, setFile] = useState<PickedFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async () => {
    if (!file || !title.trim()) {
      setError('请填写标题并选择文件。')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('title', title.trim())
      form.append('visibility', visibility)
      if (file instanceof File) {
        form.append('file', file)
      } else {
        const nativeFile = {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? 'application/octet-stream',
        }
        // biome-ignore lint/suspicious/noExplicitAny: RN FormData 支持 {uri,name,type} 形状，DOM FormData 类型定义里没有
        form.append('file', nativeFile as any)
      }
      await api.uploadResource(form)
      setTitle('')
      setFile(null)
      onUploaded()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '上传失败，请稍后重试。')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Surface style={styles.uploadCard}>
      <Text style={styles.uploadTitle}>上传资源</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="资源标题"
        placeholderTextColor={colors.textMuted}
        style={styles.titleInput}
      />
      <View style={styles.visibilityRow}>
        {(['member', 'public'] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setVisibility(v)}
            style={[styles.visibilityOption, visibility === v && styles.visibilityOptionActive]}
          >
            <Text
              style={[styles.visibilityLabel, visibility === v && styles.visibilityLabelActive]}
            >
              {v === 'member' ? '仅会员可见' : '公开'}
            </Text>
          </Pressable>
        ))}
      </View>
      <FilePicker onSelect={setFile}>
        {(open) => (
          <Pressable onPress={open} style={styles.filePickButton}>
            <Feather name="paperclip" size={14} color={colors.textSecondary} />
            <Text style={styles.filePickLabel}>{file ? file.name : '选择文件'}</Text>
          </Pressable>
        )}
      </FilePicker>
      {error ? <Text style={styles.uploadError}>{error}</Text> : null}
      <Button title="上传" onPress={onSubmit} loading={uploading} />
    </Surface>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  downloadButton: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  uploadCard: {
    gap: spacing.sm,
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  titleInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  visibilityOption: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  visibilityOptionActive: {
    backgroundColor: colors.buttonBg,
    borderColor: colors.buttonBg,
  },
  visibilityLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  visibilityLabelActive: {
    color: colors.buttonText,
    fontWeight: '600',
  },
  filePickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  filePickLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  uploadError: {
    fontSize: 13,
    color: colors.danger,
    fontFamily: fontFamily.sans,
  },
})
