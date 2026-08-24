import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { PostRow } from '@/components/PostRow'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { PostKind, PostSummary } from '@/lib/types'

type FilterKind = PostKind | 'all'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: PostSummary[]; nextCursor: string | null; loadingMore: boolean }

const FILTERS: { key: FilterKind; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'wall', label: '墙' },
  { key: 'article', label: '文章' },
]

export default function PostsListScreen() {
  const { state: authState } = useAuth()
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKind>('all')
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const isActiveMember = authState.status === 'signedIn' && authState.membership.status === 'active'

  const load = useCallback(async (kind: FilterKind) => {
    setState({ status: 'loading' })
    try {
      const res = await api.listPosts({ kind: kind === 'all' ? undefined : kind })
      setState({
        status: 'ready',
        items: res.items,
        nextCursor: res.next_cursor,
        loadingMore: false,
      })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载帖子列表失败。',
      })
    }
  }, [])

  useEffect(() => {
    load(filter)
  }, [filter, load])

  const loadMore = async () => {
    if (state.status !== 'ready' || !state.nextCursor) return
    setState({ ...state, loadingMore: true })
    try {
      const res = await api.listPosts({
        kind: filter === 'all' ? undefined : filter,
        cursor: state.nextCursor,
      })
      setState({
        status: 'ready',
        items: [...state.items, ...res.items],
        nextCursor: res.next_cursor,
        loadingMore: false,
      })
    } catch {
      setState({ ...state, loadingMore: false })
    }
  }

  return (
    <AppScreen title="社员墙" withSidebar={false}>
      <View style={styles.topRow}>
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {isActiveMember ? (
          <Button title="发帖" onPress={() => router.push('/posts/new')} style={styles.newButton} />
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={() => load(filter)} />
      ) : state.items.length === 0 ? (
        <EmptyState message="暂无帖子。" />
      ) : (
        <View style={styles.list}>
          {state.items.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
          {state.nextCursor ? (
            <Button
              title="加载更多"
              variant="secondary"
              loading={state.loadingMore}
              onPress={loadMore}
            />
          ) : null}
        </View>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.buttonBg,
    borderColor: colors.buttonBg,
  },
  filterLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
  },
  filterLabelActive: {
    color: colors.buttonText,
    fontWeight: '600',
  },
  newButton: {
    height: 36,
    paddingHorizontal: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
})
