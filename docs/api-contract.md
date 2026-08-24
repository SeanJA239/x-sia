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
`entitlement`（所有端点统一此形状）: `{kind, tier, granted_at, expires_at}`
`quota`（所有端点统一此形状）: `{daily_limit, used_today, remaining}`（单位：估算 neurons）

`/me` 的 `entitlements` 即 `entitlement[]`，与 `/entitlements` 的 `items` 元素完全一致；前端以 `entitlements.some(e => e.kind === 'admin')` 判定 admin。

密码：WebCrypto PBKDF2-SHA256，≥100k 迭代，存 `iterations:salt:hash`。

## 状态机

`applied → pending_payment → active`（`expired`/`revoked` 预留，`reviewing` 预留不用）。

- admin「确认核验」：置 `email_verified_at`（verified_by `manual`），applied → pending_payment。
- admin「确认缴费」：置 `paid_confirmed_at/_by`。
- **激活对称触发**（已裁定）：核验与缴费两个动作不限先后，后完成的一方触发 → active，并在**同一事务**内分配 member_no。
- member_no = 级 × 1000 + 顺序号（26 级第 1 位 = 26001）。级 = term 后两位。分配后永不变更，`unique(org_id, member_no)`。
- 「确认进群」独立标记，不影响状态。
- 所有 admin 动作写 audit_log（actor、action、target、meta）。

## Admin（需 admin 权限 = 存在 entitlement kind `admin` 且未撤销）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/members?term=&q=` | 成员列表，`{items: AdminMember[]}`，元素形状（已钉死）：`{id, user: {id, email, display_name}, term, status, member_no, paid_confirmed_at, in_group_at, created_at}`（user 为嵌套对象，email 不扁平） |
| POST | `/admin/members/:mid/verify` | 确认核验 |
| POST | `/admin/members/:mid/confirm-paid` | 确认缴费（可能触发 active + 编号分配） |
| POST | `/admin/members/:mid/confirm-group` | 确认进群 |
| GET | `/admin/audit` | 审计流水（倒序分页 `?cursor=`） |

## 成员与卡片

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/users/:id/public` | 身份码落地页数据：`{display_name, avatar, member_no, term, status, title, joined_at}`。无需登录。 |
| GET | `/card` | 卡片路由数据：`{display_name, member_no, term, title, stats: {attendance_count, quota_pct}, qr_payload}`。`qr_payload` 为**相对路径** `/u/:id`——API 不知道前端 origin，客户端渲染二维码时必须拼上自身 origin 成绝对 URL（否则扫码打不开）。 |

## 已裁定的行为细节

- **term 口径**：当前 UTC 自然年四位字符串（"2026"），级 = 后两位。春季招新是否按学年（9 月切换）归入上一级，开学前再定——切换点在 `src/lib/term.ts`。
- **当前 membership 判定**：取该用户最新一行（避免续费断档期权限突然消失）；「未续费提醒」属后续迭代。
- **entitlements 各端点只返回未撤销且未过期的**；历史记录展示属后续迭代。
- **GET /resources 需登录**（平台默认除标注「无需登录」外全部认证），public 可见性只影响 active 门槛，不开放匿名列表。

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

## 阶段三：活动与轮转码签到

方向：学生扫活动码（§4.2），二维码内容是**前端 URL**（`<app_origin>/checkin?t=<token>`），学生用任意相机扫开即进入已登录 portal 自动提交——web 优先，无需应用内扫码器。大屏页由前端拼 origin，API 只发 token。

- token 格式：`e.<event_id>.<window>.<sig>`，`window = floor(unix/30)`（30 秒轮转），`sig = HMAC-SHA256(event.checkin_secret, event_id + "." + window)` hex 截取 32 位。校验容忍当前与上一个 window（±30s 宽限）。
- `event.checkin_secret` 建活动时随机生成，不下发前端。
- attendance 唯一约束 `unique(event_id, user_id)`，重复签到 409 `already_checked_in`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/events` | 登录可见。`{items: [{id, title, starts_at, ends_at, location, luma_id, checked_in}]}`（checked_in = 当前用户是否已签） |
| POST | `/admin/events` | `{title, starts_at, ends_at, location, luma_id?}` |
| PATCH | `/admin/events/:id` | 局部更新同上字段 |
| GET | `/admin/events/:id/screen-token` | 大屏轮询用：`{token, expires_at}`（每 window 变化） |
| GET | `/admin/events/:id/attendance` | 签到名单 `{items: [{user: {id, display_name}, member_no, checked_in_at, method}]}` |
| POST | `/admin/events/:id/attendance` | 手动补录 `{user_id}`，method='manual'，写 audit_log |
| POST | `/checkin` | `{token}`。active 成员；验签 + window + event 起止时间（前后各宽限 30 分钟）→ 写 attendance（method='qr'）→ `{event: {id, title}, checked_in_at}`。错误码（已定 HTTP 状态）：`invalid_token`/`token_expired` → 400，`event_not_active` → 403，`already_checked_in` → 409 |
| GET | `/me/attendance` | 出勤记录 `{items: [{event: {id, title, starts_at}, checked_in_at, method}]}` |

`GET /card` 的 `stats.attendance_count` 自此为真实计数。

## 阶段三：论坛 / 墙

- 直接发布（无草稿流），删除 = status 'removed'（软删，admin 或作者本人，写 audit_log）。comment 硬删（作者或 admin，写 audit_log）。active 成员才能发帖/评论；浏览仅需登录。
- `excerpt` = body_md 前 120 字符（服务端截取，去 markdown 标记可粗糙）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/posts?kind=&cursor=&limit=` | published 列表倒序：`{items: [{id, kind, title, excerpt, author: {id, display_name}, comment_count, created_at}], next_cursor}` |
| GET | `/posts/:id` | 详情：`{id, kind, title, body_md, author, created_at, comments: [{id, body, author: {id, display_name}, created_at}]}` |
| POST | `/posts` | `{kind: 'wall'\|'article', title, body_md}` |
| POST | `/posts/:id/comments` | `{body}` |
| DELETE | `/posts/:id` | 作者或 admin |
| DELETE | `/comments/:id` | 作者或 admin |

## 阶段三：title 与 cert（全手工授予）

- schema 增量：`user` 表加 `worn_user_title_id`（佩戴指针，可空，唯一佩戴事实来源）。卡片 title = 佩戴的；未佩戴则取最新授予；一个都没有则 null。
- cert 必须挂 event（schema 即如此），serial 格式 `XSIA-<term>-<5 位随机大写字母数字>`，唯一。**`<term>` 取活动 `starts_at` 的年份**（证书是对那场活动的证明，跨年补发不改变归属），不是签发时年份。
- 已软删的帖子：作者本人或 admin 可见详情，其他人一律 404（不区分「不存在」与「无权查看」）。

写操作响应形状（已钉死）：
- `POST/PATCH /admin/events` → `{id, title, starts_at, ends_at, location, luma_id, created_at}`（不含 checkin_secret / checked_in）
- `POST /admin/events/:id/attendance` → `{checked_in_at, method}`
- `POST /admin/titles` → `{id, name}`
- `POST /admin/users/:uid/titles` → `{id, name, granted_at, worn}`
- `PUT /me/worn-title` → `{worn_user_title_id}`（回显存入的指针原值，null 即 null）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/titles` | title 定义列表 `{items: [{id, name}]}`（登录可见） |
| POST | `/admin/titles` | `{name}`（rule_json 留空） |
| POST | `/admin/users/:uid/titles` | 授予 `{title_def_id}` → user_title，写 audit_log |
| GET | `/me/titles` | `{items: [{id, name, granted_at, worn}]}`（id 为 user_title id） |
| PUT | `/me/worn-title` | `{user_title_id: string \| null}`（null = 取消佩戴，回落最新） |
| POST | `/admin/users/:uid/certificates` | `{event_id}` → 签发，返回 `{id, serial}`，写 audit_log |
| GET | `/me/certificates` | `{items: [{id, serial, event: {id, title}, issued_at}]}` |
| GET | `/verify/:serial` | **无需登录**：`{valid: true, holder_display_name, event_title, issued_at}`；不存在 → 404 `{valid: false}` 语义由 404 表达 |

## Seed（本地开发）

`pnpm --filter api seed`：创建 org `x-sia`、admin 账号 `admin@x-sia.test / admin1234`（含 admin entitlement、active、member_no 26001）、普通测试账号 `member@x-sia.test / member1234`（active、26002）、一个 applied 状态账号。

阶段三追加：一场进行中的活动（起止时间覆盖当前时刻，便于本地测签到）+ 一场未来活动、2 条 wall 帖 + 1 条 article（member 作者，带 1–2 条评论）、2 个 title 定义（其中一个已授予 member 并佩戴）、给 member 签发 1 张挂在活动上的 cert。
