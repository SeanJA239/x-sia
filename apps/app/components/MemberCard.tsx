import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { CARD_ASPECT_RATIO, cardColors, fontFamily } from '@/constants/theme'
import type { CardData } from '@/lib/types'

const FULL_WIDTH = 336
const MINI_WIDTH = 176

/**
 * 会员卡视觉——三载体（网页 / Wallet / 实体卡）统一设计语言的网页实现。
 * `interactive` 开启鼠标 3D 倾斜（web 专属，原生端不触发 mouse 事件，自然退化为平面）。
 */
export function MemberCard({
  data,
  size = 'full',
  flipped = false,
  interactive = size === 'full',
}: {
  data: CardData
  size?: 'full' | 'mini'
  flipped?: boolean
  interactive?: boolean
}) {
  const width = size === 'full' ? FULL_WIDTH : MINI_WIDTH
  const height = Math.round(width / CARD_ASPECT_RATIO)

  const tiltX = useSharedValue(0)
  const tiltY = useSharedValue(0)
  const flipProgress = useSharedValue(flipped ? 1 : 0)
  flipProgress.value = withTiming(flipped ? 1 : 0, { duration: 420 })

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${tiltX.value}deg` },
      { rotateY: `${tiltY.value + flipProgress.value * 180}deg` },
    ],
    opacity: flipProgress.value > 0.5 ? 0 : 1,
  }))
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${tiltX.value}deg` },
      { rotateY: `${tiltY.value + flipProgress.value * 180 - 180}deg` },
    ],
    opacity: flipProgress.value > 0.5 ? 1 : 0,
  }))

  // onMouseMove/onMouseLeave 是 react-native-web 对 View 的 web 专属扩展，
  // 核心 RN 类型定义里没有，仅在 web 端触发，原生端这两个 handler 不会被调用。
  const pointerHandlers = interactive
    ? {
        onMouseMove: (e: { nativeEvent: { offsetX: number; offsetY: number } }) => {
          const px = e.nativeEvent.offsetX / width - 0.5
          const py = e.nativeEvent.offsetY / height - 0.5
          tiltX.value = withTiming(py * -14, { duration: 120 })
          tiltY.value = withTiming(px * 14, { duration: 120 })
        },
        onMouseLeave: () => {
          tiltX.value = withTiming(0, { duration: 200 })
          tiltY.value = withTiming(0, { duration: 200 })
        },
      }
    : {}

  return (
    <View
      style={[styles.wrap, { width, height }]}
      // biome-ignore lint/suspicious/noExplicitAny: web-only pointer props not in core RN ViewProps
      {...(pointerHandlers as any)}
    >
      <Animated.View style={[styles.face, styles.backfaceHidden, { width, height }, frontStyle]}>
        <LinearGradient
          colors={[cardColors.navyDeep, cardColors.navy, cardColors.navy]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={[styles.brand, size === 'mini' && styles.brandMini]}>X-SIA</Text>
            <Text style={[styles.term, size === 'mini' && styles.termMini]}>{data.term}</Text>
          </View>
          <View style={styles.middle}>
            <Text
              style={[styles.titleLabel, size === 'mini' && styles.titleLabelMini]}
              numberOfLines={1}
            >
              {data.title ?? '社员'}
            </Text>
            <Text
              style={[styles.nameLabel, size === 'mini' && styles.nameLabelMini]}
              numberOfLines={1}
            >
              {data.display_name}
            </Text>
          </View>
          <View style={styles.bottomRow}>
            <Text style={[styles.memberNo, size === 'mini' && styles.memberNoMini]}>
              {data.member_no != null ? `#${data.member_no}` : '编号待分配'}
            </Text>
            {size === 'full' ? (
              <View style={styles.qrWrap}>
                <QRCode
                  value={data.qr_payload}
                  size={44}
                  backgroundColor="transparent"
                  color={cardColors.gold}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.face, styles.backfaceHidden, styles.backLayer, { width, height }, backStyle]}
      >
        <LinearGradient
          colors={[cardColors.navy, cardColors.navyDeep]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>
          <Text style={styles.backTitle}>X-SIA 社团</Text>
          <Text style={styles.backBody}>
            校园社团自有身份与权益平台，本卡为在册社员的数字凭证。
          </Text>
          <View style={styles.backList}>
            <Text style={styles.backItem}>· AI Chat 每日额度</Text>
            <Text style={styles.backItem}>· 社团资源库下载</Text>
            <Text style={styles.backItem}>· 活动优先报名（筹备中）</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 18,
    overflow: 'hidden',
  },
  backfaceHidden: {
    backfaceVisibility: 'hidden',
  },
  backLayer: {
    // 与正面完全重叠，靠 rotateY + backfaceVisibility 实现翻面
  },
  content: {
    flex: 1,
    padding: 18,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brand: {
    color: cardColors.gold,
    fontFamily: fontFamily.brand,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1,
  },
  brandMini: { fontSize: 11 },
  term: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fontFamily.mono,
    fontSize: 12,
  },
  termMini: { fontSize: 9 },
  middle: {
    gap: 4,
  },
  titleLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fontFamily.sans,
    fontSize: 12,
  },
  titleLabelMini: { fontSize: 9 },
  nameLabel: {
    color: '#FFFFFF',
    fontFamily: fontFamily.sans,
    fontSize: 20,
    fontWeight: '700',
  },
  nameLabelMini: { fontSize: 13 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  memberNo: {
    color: cardColors.gold,
    fontFamily: fontFamily.mono,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  memberNoMini: { fontSize: 11 },
  qrWrap: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 4,
    borderRadius: 6,
  },
  backTitle: {
    color: cardColors.gold,
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  backBody: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  backList: {
    gap: 4,
  },
  backItem: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fontFamily.sans,
    fontSize: 11,
  },
})
