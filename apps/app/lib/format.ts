export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const sameDay = start.toDateString() === end.toDateString()
  const startStr = formatDateTime(startsAt)
  const endStr = sameDay
    ? end.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : formatDateTime(endsAt)
  return `${startStr} – ${endStr}`
}

export function mimeLabel(mime: string): string {
  if (mime.startsWith('image/')) return '图片'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('zip') || mime.includes('compressed')) return '压缩包'
  if (mime.startsWith('video/')) return '视频'
  if (mime.startsWith('audio/')) return '音频'
  if (mime.includes('word') || mime.includes('document')) return '文档'
  if (mime.includes('sheet') || mime.includes('excel')) return '表格'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '幻灯片'
  return '文件'
}
