// 类型定义严格对齐 docs/api-contract.md，不臆造字段。

export type MembershipStatus =
  | 'applied'
  | 'pending_payment'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'reviewing'

export type User = {
  id: string
  email: string
  display_name: string
  avatar: string | null
  email_verified_at: string | null
  verified_by: 'self' | 'manual' | null
}

export type Membership = {
  id: string
  term: string
  status: MembershipStatus
  member_no: number | null
  paid_confirmed_at: string | null
  in_group_at: string | null
  created_at: string
}

export type Quota = {
  daily_limit: number
  used_today: number
  remaining: number
}

export type Entitlement = {
  kind: string
  tier: string | null
  granted_at: string
  expires_at: string | null
}

export type Me = {
  user: User
  membership: Membership
  entitlements: Entitlement[]
  quota: Quota
}

export type CardData = {
  display_name: string
  member_no: number | null
  term: string
  title: string | null
  stats: {
    attendance_count: number
    quota_pct: number
  }
  qr_payload: string
}

export type EntitlementsResponse = {
  items: Entitlement[]
  quota: Quota
}

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type ChatResponse = {
  reply: string
  usage: { neurons_est: number }
}

export type ResourceItem = {
  id: string
  title: string
  size: number
  mime: string
  visibility: 'member' | 'public'
  uploader: { id: string; display_name: string }
  created_at: string
}

export type PublicUser = {
  display_name: string
  avatar: string | null
  member_no: number | null
  term: string
  status: MembershipStatus
  title: string | null
  joined_at: string
}

export type AdminMember = {
  id: string
  user: { id: string; email: string; display_name: string }
  term: string
  status: MembershipStatus
  member_no: number | null
  paid_confirmed_at: string | null
  in_group_at: string | null
  created_at: string
}

export type AuditEntry = {
  id: string
  actor_id: string
  action: string
  target_type: string
  target_id: string
  meta: unknown
  created_at: string
}

// ---- 阶段三：活动与轮转码签到 ----

export type EventItem = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  location: string
  luma_id: string | null
  checked_in: boolean
}

export type EventInput = {
  title: string
  starts_at: string
  ends_at: string
  location: string
  luma_id?: string
}

export type ScreenToken = {
  token: string
  expires_at: string
}

export type EventAttendanceItem = {
  user: { id: string; display_name: string }
  member_no: number | null
  checked_in_at: string
  method: string
}

export type CheckinResult = {
  event: { id: string; title: string }
  checked_in_at: string
}

export type CheckinErrorCode =
  | 'invalid_token'
  | 'token_expired'
  | 'event_not_active'
  | 'already_checked_in'

export type MyAttendanceItem = {
  event: { id: string; title: string; starts_at: string }
  checked_in_at: string
  method: string
}

// ---- 阶段三：论坛 / 墙 ----

export type PostKind = 'wall' | 'article'

export type PostSummary = {
  id: string
  kind: PostKind
  title: string
  excerpt: string
  author: { id: string; display_name: string }
  comment_count: number
  created_at: string
}

export type PostComment = {
  id: string
  body: string
  author: { id: string; display_name: string }
  created_at: string
}

export type PostDetail = {
  id: string
  kind: PostKind
  title: string
  body_md: string
  author: { id: string; display_name: string }
  created_at: string
  comments: PostComment[]
}

export type PostsResponse = {
  items: PostSummary[]
  next_cursor: string | null
}

// ---- 阶段三：title 与 cert ----

export type TitleDef = {
  id: string
  name: string
}

export type MyTitle = {
  id: string
  name: string
  granted_at: string
  worn: boolean
}

export type Certificate = {
  id: string
  serial: string
  event: { id: string; title: string }
  issued_at: string
}

export type VerifyResult = {
  valid: true
  holder_display_name: string
  event_title: string
  issued_at: string
}
