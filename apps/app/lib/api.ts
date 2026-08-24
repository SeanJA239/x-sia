import { clearToken, getToken, setToken } from './storage'
import type {
  AdminMember,
  AuditEntry,
  CardData,
  Certificate,
  ChatMessage,
  ChatResponse,
  CheckinResult,
  EntitlementsResponse,
  EventAdminDetail,
  EventAttendanceItem,
  EventInput,
  EventItem,
  Me,
  MyAttendanceItem,
  MyTitle,
  PostDetail,
  PostKind,
  PostsResponse,
  PublicUser,
  RecordAttendanceResult,
  ResourceItem,
  ScreenToken,
  TitleDef,
  User,
  VerifyResult,
  WornTitleResult,
} from './types'

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '')
const API_PREFIX = `${API_BASE}/api/v1`

/** 服务端 `{error:{code,message,details?}}` 的统一错误形态。code === 'network_error' 是客户端合成的，代表请求根本没有到达服务器。 */
export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  auth?: boolean
  form?: FormData
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, form } = opts
  const headers: Record<string, string> = {}

  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = await getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
  } catch {
    throw new ApiError(0, 'network_error', '无法连接到服务器，请确认 API 已启动或检查网络后重试。')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const json = text ? safeJson(text) : null

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error
    throw new ApiError(
      res.status,
      err?.code ?? 'unknown_error',
      err?.message ?? `请求失败（HTTP ${res.status}）`,
      err?.details,
    )
  }

  return json as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const api = {
  async register(input: {
    email: string
    password: string
    display_name: string
  }): Promise<{ token: string; user: User }> {
    const data = await request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    })
    await setToken(data.token)
    return data
  },

  async login(input: { email: string; password: string }): Promise<{ token: string; user: User }> {
    const data = await request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: input,
      auth: false,
    })
    await setToken(data.token)
    return data
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/auth/logout', { method: 'POST' })
    } finally {
      await clearToken()
    }
  },

  me(): Promise<Me> {
    return request<Me>('/me')
  },

  getCard(): Promise<CardData> {
    return request<CardData>('/card')
  },

  getEntitlements(): Promise<EntitlementsResponse> {
    return request<EntitlementsResponse>('/entitlements')
  },

  aiChat(messages: ChatMessage[]): Promise<ChatResponse> {
    return request<ChatResponse>('/ai/chat', { method: 'POST', body: { messages } })
  },

  listResources(): Promise<{ items: ResourceItem[] }> {
    return request<{ items: ResourceItem[] }>('/resources')
  },

  uploadResource(form: FormData): Promise<ResourceItem> {
    return request<ResourceItem>('/resources', { method: 'POST', form })
  },

  getResourceDownloadUrl(id: string): Promise<{ url: string }> {
    return request<{ url: string }>(`/resources/${id}/download`)
  },

  deleteResource(id: string): Promise<void> {
    return request<void>(`/resources/${id}`, { method: 'DELETE' })
  },

  getPublicUser(id: string): Promise<PublicUser> {
    return request<PublicUser>(`/users/${id}/public`, { auth: false })
  },

  // ---- 阶段三：活动与轮转码签到 ----

  listEvents(): Promise<{ items: EventItem[] }> {
    return request<{ items: EventItem[] }>('/events')
  },

  checkin(token: string): Promise<CheckinResult> {
    return request<CheckinResult>('/checkin', { method: 'POST', body: { token } })
  },

  getMyAttendance(): Promise<{ items: MyAttendanceItem[] }> {
    return request<{ items: MyAttendanceItem[] }>('/me/attendance')
  },

  // ---- 阶段三：论坛 / 墙 ----

  listPosts(
    params: { kind?: PostKind; cursor?: string; limit?: number } = {},
  ): Promise<PostsResponse> {
    const qs = new URLSearchParams()
    if (params.kind) qs.set('kind', params.kind)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return request<PostsResponse>(`/posts${suffix}`)
  },

  getPost(id: string): Promise<PostDetail> {
    return request<PostDetail>(`/posts/${id}`)
  },

  createPost(input: { kind: PostKind; title: string; body_md: string }): Promise<PostDetail> {
    return request<PostDetail>('/posts', { method: 'POST', body: input })
  },

  commentOnPost(id: string, body: string): Promise<{ id: string }> {
    return request<{ id: string }>(`/posts/${id}/comments`, { method: 'POST', body: { body } })
  },

  deletePost(id: string): Promise<void> {
    return request<void>(`/posts/${id}`, { method: 'DELETE' })
  },

  deleteComment(id: string): Promise<void> {
    return request<void>(`/comments/${id}`, { method: 'DELETE' })
  },

  // ---- 阶段三：title 与 cert ----

  listTitleDefs(): Promise<{ items: TitleDef[] }> {
    return request<{ items: TitleDef[] }>('/titles')
  },

  getMyTitles(): Promise<{ items: MyTitle[] }> {
    return request<{ items: MyTitle[] }>('/me/titles')
  },

  setWornTitle(userTitleId: string | null): Promise<WornTitleResult> {
    return request<WornTitleResult>('/me/worn-title', {
      method: 'PUT',
      body: { user_title_id: userTitleId },
    })
  },

  getMyCertificates(): Promise<{ items: Certificate[] }> {
    return request<{ items: Certificate[] }>('/me/certificates')
  },

  verifyCertificate(serial: string): Promise<VerifyResult> {
    return request<VerifyResult>(`/verify/${serial}`, { auth: false })
  },

  admin: {
    listMembers(params: { term?: string; q?: string } = {}): Promise<{ items: AdminMember[] }> {
      const qs = new URLSearchParams()
      if (params.term) qs.set('term', params.term)
      if (params.q) qs.set('q', params.q)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return request<{ items: AdminMember[] }>(`/admin/members${suffix}`)
    },
    verify(mid: string): Promise<void> {
      return request<void>(`/admin/members/${mid}/verify`, { method: 'POST' })
    },
    confirmPaid(mid: string): Promise<void> {
      return request<void>(`/admin/members/${mid}/confirm-paid`, { method: 'POST' })
    },
    confirmGroup(mid: string): Promise<void> {
      return request<void>(`/admin/members/${mid}/confirm-group`, { method: 'POST' })
    },
    audit(cursor?: string): Promise<{ items: AuditEntry[]; cursor?: string }> {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<{ items: AuditEntry[]; cursor?: string }>(`/admin/audit${suffix}`)
    },

    createEvent(input: EventInput): Promise<EventAdminDetail> {
      return request<EventAdminDetail>('/admin/events', { method: 'POST', body: input })
    },
    updateEvent(id: string, input: Partial<EventInput>): Promise<EventAdminDetail> {
      return request<EventAdminDetail>(`/admin/events/${id}`, { method: 'PATCH', body: input })
    },
    getEvent(id: string): Promise<EventAdminDetail> {
      return request<EventAdminDetail>(`/admin/events/${id}`)
    },
    getScreenToken(id: string): Promise<ScreenToken> {
      return request<ScreenToken>(`/admin/events/${id}/screen-token`)
    },
    getEventAttendance(id: string): Promise<{ items: EventAttendanceItem[] }> {
      return request<{ items: EventAttendanceItem[] }>(`/admin/events/${id}/attendance`)
    },
    recordAttendance(id: string, userId: string): Promise<RecordAttendanceResult> {
      return request<RecordAttendanceResult>(`/admin/events/${id}/attendance`, {
        method: 'POST',
        body: { user_id: userId },
      })
    },

    createTitleDef(name: string): Promise<TitleDef> {
      return request<TitleDef>('/admin/titles', { method: 'POST', body: { name } })
    },
    grantTitle(uid: string, titleDefId: string): Promise<MyTitle> {
      return request<MyTitle>(`/admin/users/${uid}/titles`, {
        method: 'POST',
        body: { title_def_id: titleDefId },
      })
    },
    issueCertificate(uid: string, eventId: string): Promise<{ id: string; serial: string }> {
      return request<{ id: string; serial: string }>(`/admin/users/${uid}/certificates`, {
        method: 'POST',
        body: { event_id: eventId },
      })
    },
  },
}
