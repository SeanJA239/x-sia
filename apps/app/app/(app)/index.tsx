import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AppScreen } from '@/components/AppScreen'
import { PostRow } from '@/components/PostRow'
import { StatusBanner } from '@/components/StatusBanner'
import { ErrorState, LoadingState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'
import { colors, fontFamily } from '@/constants/theme'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { PostSummary } from '@/lib/types'

type FeedState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: PostSummary[] }

export default function HomeScreen() {
  const { state } = useAuth()
  const router = useRouter()
  const displayName = state.status === 'signedIn' ? state.user.display_name : ''
  const [feed, setFeed] = useState<FeedState>({ status: 'loading' })

  const load = useCallback(async () => {
    setFeed({ status: 'loading' })
    try {
      const res = await api.listPosts({ limit: 5 })
      setFeed({ status: 'ready', items: res.items })
    } catch (err) {
      setFeed({
        status: 'error',
        message: err instanceof ApiError ? err.message : '加载内容流失败。',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppScreen title={`你好，${displayName}`}>
      {state.status === 'signedIn' ? <StatusBanner status={state.membership.status} /> : null}

      <View style={styles.feedHeader}>
        <Text style={styles.feedTitle}>内容流</Text>
        <Pressable onPress={() => router.push('/posts')}>
          <Text style={styles.viewAll}>查看全部 →</Text>
        </Pressable>
      </View>

      {feed.status === 'loading' ? (
        <LoadingState />
      ) : feed.status === 'error' ? (
        <ErrorState message={feed.message} onRetry={load} />
      ) : feed.items.length === 0 ? (
        <Surface>
          <Text style={styles.emptyText}>暂无发帖，来写第一条吧。</Text>
        </Surface>
      ) : (
        feed.items.map((post) => <PostRow key={post.id} post={post} />)
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  viewAll: {
    fontSize: 13,
    color: colors.link,
    fontFamily: fontFamily.sans,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
  },
})
