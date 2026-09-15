export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
export const TOKEN_KEY = 'x-sia:token'

// Same-origin browser calls share the existing session, without copying tokens across domains.
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.auth) {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) headers.Authorization = `Bearer ${token}`
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new ApiError(
      0,
      'network_error',
      '无法连接本地 API 或请求超时。请稍后重试；保存超时后请先刷新确认结果。',
    )
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (options.auth && response.status === 401) localStorage.removeItem(TOKEN_KEY)
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'request_failed',
      data?.error?.message ?? `请求失败（HTTP ${response.status}）`,
    )
  }
  if (data === null) throw new ApiError(502, 'invalid_response', '服务返回了无效内容')
  return data as T
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : '发生未知错误'
}

export type Access = { can_edit: boolean; can_publish: boolean }
export type Entry = {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  published_at: string
}
export type PublicPage = Entry & { body_md: string; revision_number: number }
export type PageList = {
  items: Entry[]
  categories: { category: string; count: number }[]
  total: number
  page: number
  page_size: number
}
export type Revision = {
  id: string
  number: number
  title: string
  summary: string
  category: string
  body_md: string
  change_note: string
  created_at: string
}
export type DraftPage = {
  id: string
  slug: string
  version: number
  published_revision_id: string | null
  published_at: string | null
  draft: Revision
}
export type ManagedPage = Entry & {
  version: number
  updated_at: string
  draft_revision_id: string
  published_revision_id: string | null
}
export type Paged<T> = { items: T[]; total: number; page: number; page_size: number }
