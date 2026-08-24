import { Platform } from 'react-native'

/**
 * API 返回的 qr_payload 是相对路径（`/u/:id`）——服务端不知道前端 origin。
 * 渲染二维码前必须拼成绝对 URL，否则扫码打开的是设备本地相对路径，打不开。
 */
export function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  if (Platform.OS === 'web') {
    try {
      return new URL(path, window.location.origin).toString()
    } catch {
      return path
    }
  }
  return path
}

/** 大屏页拼签到码链接用：`${origin}/checkin?t=<token>`。原生端没有 window，退化为相对路径。 */
export function getAppOrigin(): string {
  if (Platform.OS === 'web') {
    try {
      return window.location.origin
    } catch {
      return ''
    }
  }
  return ''
}
