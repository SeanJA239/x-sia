# API 契约（v1，冲刺范围）

api 与 app 两端共同遵守本文件。改动契约必须先改本文件再改代码。

## 通用

- Base：本地 `http://localhost:8787`，线上待定。所有路由前缀 `/api/v1`。
- 认证：`Authorization: Bearer <session_token>`。token 为 43 字符随机串，服务端只存 SHA-256 hash。
- 错误统一：`{ "error": { "code": string, "message": string } }`，HTTP 状态语义化（400/401/403/404/409/429/500）。
- 时间一律 ISO 8601 UTC 字符串；id 为随机串（nanoid 风格）。
- 单租户运行：seed 一个 org（slug `x-sia`），所有查询按 org_id 过滤。
- CORS：允许 `http://localhost:*` 与配置的前端 origin。

## Auth

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | `{email, password, display_name}` → `201 {token, user}`。email 全局唯一（409 冲突）。注册即创建当届 membership（status `applied`）。不发验证邮件。 |
| POST | `/auth/login` | `{email, password}` → `{token, user}` |
| POST | `/auth/logout` | 使当前 token 失效 |
| GET | `/me` | `{user, membership, entitlements, quota}`（结构见下） |

`user`: `{id, email, display_name, avatar, email_verified_at, verified_by}`
`membership`: `{id, term, status, member_no, paid_confirmed_at, in_group_at, created_at}`
`quota`: `{daily_limit, used_today, remaining}`（单位：估算 neurons）

密码：WebCrypto PBKDF2-SHA256，≥100k 迭代，存 `iterations:salt:hash`。

## 状态机

`applied → pending_payment → active`（`expired`/`revoked` 预留，`reviewing` 预留不用）。

- admin「确认核验」：置 `email_verified_at`（verified_by `manual`），applied → pending_payment。
- admin「确认缴费」：置 `paid_confirmed_at/_by`；若已核验 → active，并在**同一事务**内分配 member_no。
- member_no = 级 × 1000 + 顺序号（26 级第 1 位 = 26001）。级 = term 后两位。分配后永不变更，`unique(org_id, member_no)`。
- 「确认进群」独立标记，不影响状态。
- 所有 admin 动作写 audit_log（actor、action、target、meta）。

## Admin（需 admin 权限 = 存在 entitlement kind `admin` 且未撤销）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/members?term=&q=` | 成员列表（含 email、双标记、状态、member_no） |
| POST | `/admin/members/:mid/verify` | 确认核验 |
| POST | `/admin/members/:mid/confirm-paid` | 确认缴费（可能触发 active + 编号分配） |
| POST | `/admin/members/:mid/confirm-group` | 确认进群 |
| GET | `/admin/audit` | 审计流水（倒序分页 `?cursor=`） |

## 成员与卡片

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/users/:id/public` | 身份码落地页数据：`{display_name, avatar, member_no, term, status, title, joined_at}`。无需登录。 |
| GET | `/card` | 卡片路由数据：`{display_name, member_no, term, title, stats: {attendance_count, quota_pct}, qr_payload}`。`qr_payload` = 指向 `/u/:id` 的 URL。 |

## 权益与 AI 网关

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/entitlements` | `{items: [{kind, tier, granted_at, expires_at}], quota}` |
| POST | `/ai/chat` | `{messages: [{role, content}]}` → `{reply, usage: {neurons_est}}`。默认模型小模型（如 `@cf/meta/llama-3.2-3b-instruct`）。 |

配额规则：active 成员默认日额度（standard 档，建议 80 neurons 估算值/日），entitlement kind `ai_chat` 的 tier 可提档；`ai_usage` 逐条记账，判定用当日聚合；超限 429 `quota_exceeded`；全局熔断：全站当日估算总量超阈值时 503 `circuit_open`。非 active 成员 403。

## 资源

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/resources` | 列表：`{items: [{id, title, size, mime, visibility, uploader: {id, display_name}, created_at}]}`。member 可见项要求 active。 |
| POST | `/resources` | multipart：`file` + `title` + `visibility`。active 成员可传。R2 key：`res/<id>/<filename>`。 |
| GET | `/resources/:id/download` | 校验权限 → `{url}`，url 为短时效签名链接（下条），有效 5 分钟。 |
| GET | `/resources/:id/file?exp=&sig=` | HMAC 校验（secret 服务端持有）通过即从 R2 流式返回，无需登录态。 |
| DELETE | `/resources/:id` | 上传者本人或 admin 下架（写 audit_log）。 |

## Seed（本地开发）

`pnpm --filter api seed`：创建 org `x-sia`、admin 账号 `admin@x-sia.test / admin1234`（含 admin entitlement、active、member_no 26001）、普通测试账号 `member@x-sia.test / member1234`（active、26002）、一个 applied 状态账号。
