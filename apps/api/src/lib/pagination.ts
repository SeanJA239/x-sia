import { AppError } from './errors'

export type Cursor = { createdAt: string; id: string }

/** 倒序分页游标：base64(JSON({createdAt, id}))，用 (created_at, id) 二元组防止同毫秒撞车。 */
export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(atob(raw))
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') return parsed
    return null
  } catch {
    throw new AppError(400, 'bad_request', 'cursor 不合法')
  }
}

export function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify(cursor))
}
