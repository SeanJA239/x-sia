import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { colors, fontFamily } from '@/constants/theme'
import type { EventFields, EventInput } from '@/lib/types'

/** datetime-local 输入转 ISO；输入非法时返回 null。 */
function toIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function toInputValue(iso: string): string {
  // 截到分钟精度，适配 <input type="datetime-local"> 期望的本地时间格式
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: EventFields
  submitLabel: string
  onSubmit: (input: EventInput) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [startsAt, setStartsAt] = useState(initial ? toInputValue(initial.starts_at) : '')
  const [endsAt, setEndsAt] = useState(initial ? toInputValue(initial.ends_at) : '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [lumaId, setLumaId] = useState(initial?.luma_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setError(null)
    const startsIso = toIso(startsAt)
    const endsIso = toIso(endsAt)
    if (!title.trim() || !location.trim() || !startsIso || !endsIso) {
      setError('请完整填写标题、起止时间（格式如 2026-08-24T14:00）与地点。')
      return
    }
    if (new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
      setError('结束时间必须晚于开始时间。')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        starts_at: startsIso,
        ends_at: endsIso,
        location: location.trim(),
        luma_id: lumaId.trim() || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <TextField label="活动标题" value={title} onChangeText={setTitle} placeholder="新生欢迎会" />
      <TextField
        label="开始时间"
        value={startsAt}
        onChangeText={setStartsAt}
        placeholder="2026-08-24T14:00"
      />
      <TextField
        label="结束时间"
        value={endsAt}
        onChangeText={setEndsAt}
        placeholder="2026-08-24T16:00"
      />
      <TextField
        label="地点"
        value={location}
        onChangeText={setLocation}
        placeholder="行政楼报告厅"
      />
      <TextField
        label="Luma 活动 ID（可选）"
        value={lumaId}
        onChangeText={setLumaId}
        placeholder="仅作对外报名层关联指针"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={submitLabel} onPress={submit} loading={submitting} />
    </>
  )
}

const styles = StyleSheet.create({
  error: {
    fontSize: 13,
    color: colors.danger,
    fontFamily: fontFamily.sans,
  },
})
