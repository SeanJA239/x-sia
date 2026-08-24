import { StyleSheet, Text, View } from 'react-native'

import { colors, fontFamily, radius, spacing } from '@/constants/theme'
import type { MembershipStatus } from '@/lib/types'

const COPY: Partial<
  Record<MembershipStatus, { title: string; body: string; tone: 'warning' | 'success' }>
> = {
  applied: {
    title: '报名已提交',
    body: '完成现场核验后即可开通会员权益，请留意社团工作人员的通知。',
    tone: 'warning',
  },
  pending_payment: {
    title: '身份已核验',
    body: '缴纳社费后管理员确认即可激活会员权益并分配专属编号。',
    tone: 'warning',
  },
  expired: {
    title: '会员资格已过期',
    body: '如需继续使用会员权益，请联系社团工作人员续费。',
    tone: 'warning',
  },
  revoked: {
    title: '会员资格已被取消',
    body: '如有疑问请联系社团工作人员。',
    tone: 'warning',
  },
}

export function StatusBanner({ status }: { status: MembershipStatus }) {
  const copy = COPY[status]
  if (!copy) return null

  return (
    <View style={[styles.banner, copy.tone === 'warning' ? styles.warning : styles.success]}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
  },
  warning: {
    backgroundColor: '#F7EEDF',
    borderColor: '#EBD9B5',
  },
  success: {
    backgroundColor: '#E4F5EC',
    borderColor: '#BFE6D2',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.warning,
    fontFamily: fontFamily.sans,
  },
  body: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fontFamily.sans,
    lineHeight: 18,
  },
})
