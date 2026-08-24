import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { Button } from '@/components/ui/Button'
import { Surface } from '@/components/ui/Surface'
import { TextField } from '@/components/ui/TextField'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import type { PostKind } from '@/lib/types'

export default function NewPostScreen() {
  const router = useRouter()
  const [kind, setKind] = useState<PostKind>('wall')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async () => {
    setError(null)
    if (!title.trim() || !body.trim()) {
      setError('请填写标题和正文。')
      return
    }
    setSubmitting(true)
    try {
      const post = await api.createPost({ kind, title: title.trim(), body_md: body.trim() })
      router.replace({ pathname: '/posts/[id]', params: { id: post.id } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发帖失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppScreen title="发帖" withSidebar={false}>
      <Surface style={styles.form}>
        <Text style={styles.label}>类型</Text>
        <View style={styles.kindRow}>
          {(['wall', 'article'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[styles.kindOption, kind === k && styles.kindOptionActive]}
            >
              <Text style={[styles.kindLabel, kind === k && styles.kindLabelActive]}>
                {k === 'wall' ? '墙（随手发）' : '文章（长文）'}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextField
          label="标题"
          value={title}
          onChangeText={setTitle}
          placeholder="给帖子起个标题"
        />

        <Text style={styles.label}>正文</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="支持 Markdown"
          placeholderTextColor={colors.textMuted}
          style={styles.bodyInput}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="发布" onPress={onSubmit} loading={submitting} />
      </Surface>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  kindRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kindOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kindOptionActive: {
    backgroundColor: colors.buttonBg,
    borderColor: colors.buttonBg,
  },
  kindLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  kindLabelActive: {
    color: colors.buttonText,
    fontWeight: '600',
  },
  bodyInput: {
    minHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    fontFamily: fontFamily.sans,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    fontFamily: fontFamily.sans,
  },
})
