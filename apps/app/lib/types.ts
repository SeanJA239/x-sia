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
