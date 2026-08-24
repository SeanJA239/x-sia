import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Chip } from '@/components/ui/Chip'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily } from '@/constants/theme'
import { formatDateTime } from '@/lib/format'
import type { PostSummary } from '@/lib/types'

export function PostRow({ post }: { post: PostSummary }) {
  const router = useRouter()
  return (
    <Pressable onPress={() => router.push({ pathname: '/posts/[id]', params: { id: post.id } })}>
      <Surface style={styles.card}>
        <View style={styles.header}>
          <Chip
            label={post.kind === 'article' ? '文章' : '墙'}
            tone={post.kind === 'article' ? 'gold' : 'neutral'}
          />
          <Text style={styles.date}>{formatDateTime(post.created_at)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {post.title}
        </Text>
        <Text style={styles.excerpt} numberOfLines={2}>
          {post.excerpt}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.author}>{post.author.display_name}</Text>
          <View style={styles.commentCount}>
            <Feather name="message-circle" size={12} color={colors.textMuted} />
            <Text style={styles.commentCountText}>{post.comment_count}</Text>
          </View>
        </View>
      </Surface>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
  },
  header: {
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  excerpt: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  author: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentCountText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fontFamily.mono,
  },
})
