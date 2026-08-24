import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

// 所有时间戳存 ISO 8601 UTC 字符串（与 api-contract.md 输出格式一致），不用 SQLite 的
// integer timestamp 模式，避免序列化时来回转换。

export const org = sqliteTable('org', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // JSON 字符串数组，如 ["stu.example.edu.cn"]。per-org 配置，不硬编码后缀。
  emailDomains: text('email_domains').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
})

// 全局身份表，不带 org_id：同一用户可跨 org 持有多条 membership。
// unique(email) 是防小号机制，一人一个校内邮箱。
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  // PBKDF2-SHA256 格式 "iterations:salt:hash"，均为 base64url。
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  avatar: text('avatar'),
  // 邮箱在注册时的核验快照；校内邮箱毕业后可能回收，身份判定看这个字段，不看邮箱当前是否可用。
  emailVerifiedAt: text('email_verified_at'),
  verifiedBy: text('verified_by', { enum: ['self', 'manual'] }),
  createdAt: text('created_at').notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  // 只存 SHA-256 hash，明文 token 只在签发响应中出现一次。
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
})

export const membershipStatusValues = [
  'applied',
  'pending_payment',
  'active',
  'expired',
  'revoked',
] as const
export type MembershipStatus = (typeof membershipStatusValues)[number]

export const membership = sqliteTable(
  'membership',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => org.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    // 届别，如 "2026"。级取首次入社年级两位年份，用于 member_no 前缀。
    term: text('term').notNull(),
    status: text('status', { enum: membershipStatusValues }).notNull().default('applied'),
    // member_no = 级*1000 + 顺序号，在 status 首次变为 active 时于同一事务内分配，之后永不变更。
    memberNo: integer('member_no'),
    paidConfirmedAt: text('paid_confirmed_at'),
    paidConfirmedBy: text('paid_confirmed_by').references(() => user.id),
    inGroupAt: text('in_group_at'),
    inGroupBy: text('in_group_by').references(() => user.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    unique('membership_org_member_no_unique').on(t.orgId, t.memberNo),
    unique('membership_org_user_term_unique').on(t.orgId, t.userId, t.term),
    index('membership_org_term_idx').on(t.orgId, t.term),
  ],
)

export const entitlement = sqliteTable(
  'entitlement',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => org.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    // 'admin' | 'ai_chat' | 其他自定义权益 kind，与角色解耦，可单独授予/回收。
    kind: text('kind').notNull(),
    tier: text('tier'),
    grantedAt: text('granted_at').notNull(),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
  },
  (t) => [index('entitlement_org_user_kind_idx').on(t.orgId, t.userId, t.kind)],
)

export const aiUsage = sqliteTable(
  'ai_usage',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => org.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    model: text('model').notNull(),
    // 按输入+输出字符数近似估算，见 lib/ai.ts estimateNeurons()。
    neurons: integer('neurons').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('ai_usage_org_created_idx').on(t.orgId, t.createdAt),
    index('ai_usage_user_created_idx').on(t.userId, t.createdAt),
  ],
)

export const post = sqliteTable('post', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => org.id),
  authorId: text('author_id')
    .notNull()
    .references(() => user.id),
  kind: text('kind', { enum: ['wall', 'article'] }).notNull(),
  title: text('title'),
  bodyMd: text('body_md').notNull(),
  status: text('status', { enum: ['draft', 'published', 'removed'] })
    .notNull()
    .default('draft'),
  createdAt: text('created_at').notNull(),
})

export const comment = sqliteTable('comment', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => org.id),
  postId: text('post_id')
    .notNull()
    .references(() => post.id),
  authorId: text('author_id')
    .notNull()
    .references(() => user.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
})

export const resource = sqliteTable('resource', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => org.id),
  uploaderId: text('uploader_id')
    .notNull()
    .references(() => user.id),
  title: text('title').notNull(),
  // R2 key，形如 res/<id>/<filename>。
  r2Key: text('r2_key').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  visibility: text('visibility', { enum: ['member', 'public'] })
    .notNull()
    .default('member'),
  createdAt: text('created_at').notNull(),
})

export const event = sqliteTable('event', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => org.id),
  title: text('title').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  location: text('location'),
  // 签到二维码轮转密钥：HMAC(checkin_secret, event_id + time_window)。
  checkinSecret: text('checkin_secret').notNull(),
  // Luma 仅作对外报名层的人工关联指针，权益相关出勤只认自家签到。
  lumaId: text('luma_id'),
  createdAt: text('created_at').notNull(),
})

export const attendance = sqliteTable(
  'attendance',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => org.id),
    eventId: text('event_id')
      .notNull()
      .references(() => event.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    checkedInAt: text('checked_in_at').notNull(),
    method: text('method', { enum: ['qr', 'manual'] }).notNull(),
  },
  (t) => [unique('attendance_event_user_unique').on(t.eventId, t.userId)],
)

export const titleDef = sqliteTable('title_def', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => org.id),
  name: text('name').notNull(),
  // 第一年全部手工授予，规则引擎留空。
  ruleJson: text('rule_json'),
})

export const userTitle = sqliteTable(
  'user_title',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => org.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    titleDefId: text('title_def_id')
      .notNull()
      .references(() => titleDef.id),
    grantedAt: text('granted_at').notNull(),
    // 成员选一个「佩戴」上卡；未显式选择时默认取 granted_at 最新的一条。
    isWorn: integer('is_worn', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('user_title_org_user_idx').on(t.orgId, t.userId)],
)

export const certificate = sqliteTable('certificate', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => org.id),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  eventId: text('event_id').references(() => event.id),
  // 走 /verify/:serial 公开可查链接。
  serial: text('serial').notNull().unique(),
  issuedAt: text('issued_at').notNull(),
})

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => org.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    // 任意结构化上下文，JSON 字符串。
    meta: text('meta'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('audit_log_org_created_idx').on(t.orgId, t.createdAt)],
)

export const pass = sqliteTable('pass', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => org.id),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  serial: text('serial').notNull().unique(),
  authTokenHash: text('auth_token_hash').notNull(),
  lastUpdatedAt: text('last_updated_at').notNull(),
})

export const passDevice = sqliteTable(
  'pass_device',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => org.id),
    passId: text('pass_id')
      .notNull()
      .references(() => pass.id),
    deviceLibraryId: text('device_library_id').notNull(),
    pushToken: text('push_token').notNull(),
    registeredAt: text('registered_at').notNull(),
  },
  (t) => [
    // 同一设备重装/换备份后用新 push token 重新注册同一张 pass：以最新注册为准，
    // 这个唯一约束配合 upsert（见阶段四实现）替换旧记录，避免向失效 token 持续推送。
    unique('pass_device_pass_device_unique').on(t.passId, t.deviceLibraryId),
  ],
)

export const schema = {
  org,
  user,
  session,
  membership,
  entitlement,
  aiUsage,
  post,
  comment,
  resource,
  event,
  attendance,
  titleDef,
  userTitle,
  certificate,
  auditLog,
  pass,
  passDevice,
}
