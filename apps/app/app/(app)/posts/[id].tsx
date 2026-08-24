import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import type { PostDetail } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; post: PostDetail }

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { state: authState, isAdmin } = useAuth()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setState({ status: 'loading' })
    try {
      const post = await api.getPost(id)
      setState({ status: 'ready', post })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载帖子失败。',
      })
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const isActiveMember = authState.status === 'signedIn' && authState.membership.status === 'active'
  const canDeletePost =
    state.status === 'ready' &&
    authState.status === 'signedIn' &&
    (isAdmin || authState.user.id === state.post.author.id)

  const submitComment = async () => {
    if (!id || !comment.trim()) return
    setPosting(true)
    try {
      await api.commentOnPost(id, comment.trim())
      setComment('')
      await load()
    } catch (err) {
      Alert.alert('评论失败', err instanceof ApiError ? err.message : '请稍后重试。')
    } finally {
      setPosting(false)
    }
  }

  const deletePost = () => {
    if (!id) return
    Alert.alert('删除帖子', '删除后不可恢复，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deletePost(id)
            router.replace('/posts')
          } catch (err) {
            Alert.alert('删除失败', err instanceof ApiError ? err.message : '请稍后重试。')
          }
        },
      },
    ])
  }

  const deleteComment = (commentId: string) => {
    Alert.alert('删除评论', '确定删除这条评论吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteComment(commentId)
            await load()
          } catch (err) {
            Alert.alert('删除失败', err instanceof ApiError ? err.message : '请稍后重试。')
          }
        },
      },
    ])
  }

  return (
    <AppScreen title="帖子" withSidebar={false}>
      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : (
        <>
          <Surface style={styles.postCard}>
            <View style={styles.postHeader}>
              <Chip
                label={state.post.kind === 'article' ? '文章' : '墙'}
                tone={state.post.kind === 'article' ? 'gold' : 'neutral'}
              />
              <Text style={styles.date}>{formatDateTime(state.post.created_at)}</Text>
            </View>
            <Text style={styles.title}>{state.post.title}</Text>
            <Text style={styles.author}>{state.post.author.display_name}</Text>
            <Text style={styles.body}>{state.post.body_md}</Text>
            {canDeletePost ? (
              <Button
                title="删除帖子"
                variant="secondary"
                onPress={deletePost}
                style={styles.deleteButton}
              />
            ) : null}
          </Surface>

          <Surface>
            <Text style={styles.commentsTitle}>评论（{state.post.comments.length}）</Text>
            {state.post.comments.map((c) => {
              const canDeleteComment =
                authState.status === 'signedIn' && (isAdmin || authState.user.id === c.author.id)
              return (
                <View key={c.id} style={styles.commentRow}>
                  <View style={styles.commentMain}>
                    <Text style={styles.commentAuthor}>{c.author.display_name}</Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                    <Text style={styles.commentDate}>{formatDateTime(c.created_at)}</Text>
                  </View>
                  {canDeleteComment ? (
                    <Button
                      title="删除"
                      variant="ghost"
                      onPress={() => deleteComment(c.id)}
                      style={styles.commentDeleteButton}
                    />
                  ) : null}
                </View>
              )
            })}

            {isActiveMember ? (
              <View style={styles.commentForm}>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="写条评论…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.commentInput}
                  multiline
                />
                <Button
                  title="发送"
                  onPress={submitComment}
                  loading={posting}
                  disabled={!comment.trim()}
                />
              </View>
            ) : null}
          </Surface>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  postCard: {
    gap: spacing.xs,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fontFamily.mono,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  author: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  body: {
    fontSize: 15,
    color: colors.text,
    fontFamily: fontFamily.sans,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  commentsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
    marginBottom: spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  commentMain: {
    flex: 1,
    gap: 2,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  commentBody: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  commentDate: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fontFamily.mono,
  },
  commentDeleteButton: {
    height: 28,
    paddingHorizontal: spacing.xs,
  },
  commentForm: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  commentInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    fontFamily: fontFamily.sans,
    color: colors.text,
    textAlignVertical: 'top',
  },
})
