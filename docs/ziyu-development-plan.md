# ziyu 开发与维护计划

## 1. 基线与结论

- 工作分支：`ziyu/dev-maintenance`。
- 审阅基线：`d0bbcf3`。
- 本文基于仓库文档、配置、核心实现与测试源码的静态审阅；本轮未安装依赖、运行测试、构建或部署。功能存在不等于运行验收通过。
- 业务决议以 `decisions.md` 覆盖 `design.md` 的旧结论；接口变更遵循 `api-contract.md`，先改契约再改实现。
- 当前定位：身份 + 内容 + 权益平台的 MVP 实现，阶段一至三均已有业务代码；下一轮重点是可靠交付，不是继续扩大功能范围。

## 2. 技术栈与职责

| 层 | 仓库实际选型 | 职责与边界 |
| --- | --- | --- |
| 工程组织 | pnpm workspace、TypeScript、Biome | 三应用单仓库；尚无共享契约 package |
| API | Hono 4、Zod 4、Cloudflare Workers、Wrangler 4 | 鉴权、成员资格、权益、资源、签到、内容与后台 |
| 数据 | Cloudflare D1 / SQLite、Drizzle ORM 0.44、SQL migrations | 结构化数据、状态和审计；运行时固定 org `x-sia` |
| 文件 | Cloudflare R2 | Worker 校验短时 HMAC 下载链接后流式返回，不是公开桶直链 |
| AI | Workers AI、小模型、D1 用量流水 | 非流式聊天；当前额度单位是字符数估算，不是准确账单 neurons |
| 成员端及后台 | Expo SDK 57、React 19.2、React Native 0.86、Expo Router、React Native Web | Web 优先，一个应用覆盖成员与 admin；后台路由守卫不替代服务端鉴权 |
| 前端状态与请求 | React Context、自封装 fetch、手写 TypeScript DTO | auth/card/dialog 上下文；Web token 在 localStorage，原生在 AsyncStorage |
| 门面站 | React Router 8、Vite 8、Fumadocs 16、MDX、Tailwind 4 | 官网、指南、精选文章；配置包含 SSR 和预渲染，不能视为已验证的纯静态交付 |
| 测试 | Vitest 4、Cloudflare Workers pool、Miniflare | 后端存在鉴权、会员状态、配额拒绝、签名、签到、帖子与称号证书测试 |

```text
门面站：介绍 / 文档 / 精选文章（Git + MDX）
                    ↓ 成员入口
成员端 / admin（Expo Web）
                    ↓ HTTPS / Bearer token
Hono / Workers
  ├── D1 + Drizzle：身份、资格、权益、内容、活动、审计
  ├── R2：资源文件
  └── Workers AI：社员聊天权益
```

保持现有架构：当前不引入微服务、Redis、Kubernetes，不迁移 Next.js，不先做原生分发。业务表已有租户字段，但尚不是可对外承诺的完整多租户产品。

## 3. 已有功能与交付边界

- 注册、登录、退出、当前用户与会话鉴权。
- 管理员核验 / 确认缴费 / 确认进群、编号分配和审计。
- 个人页、公开身份页、全屏会员卡与身份二维码。
- 权益展示、AI 聊天、资源上传 / 下载 / 下架。
- 活动管理、轮转签到码、大屏、个人出勤与人工补录。
- 论坛 / 墙、评论、称号授予与佩戴、证书签发与公开验证。
- 官网指南和两篇 MDX 文章。
- Wallet Pass 目前仅有预留表，未见签发、PassKit web service、APNs 实现。

以上是源码存在性判断，不代表端到端、并发或生产环境已验收。

## 4. 优先问题

### P0：上线前阻断项

1. **生产环境连接不完整**
   - `apps/api/src/index.ts` 仅放行 localhost / 127.0.0.1 的 CORS origin，契约中的配置化生产 origin 尚未实现。
   - `apps/api/wrangler.jsonc` 的 D1 ID 仍为 `TODO`；应通过正确的环境绑定配置注入，不能用普通 `--var` 替换 D1 database binding。
   - 成员端默认 API 地址为 localhost，需要明确 preview / production 的构建环境变量。
   - 明确域名、D1、R2、SIGN_SECRET、迁移及首位管理员的初始化流程；开发 seed 不得进入生产。

2. **质量检查覆盖不完整**
   - 根 `build` 使用 `--if-present`；只有 site 提供 build，成功不能代表 API 和 Expo Web 可交付。
   - 根测试只覆盖有 test script 的应用；app/site 未见自动化测试入口，未见 `.github/workflows`。
   - 三端类型检查命名不统一：api/app 为 `typecheck`，site 为 `types:check`。
   - 应固定 Node/pnpm 版本，分别检查 lint、三端类型、API 测试、Expo Web 导出、site 构建和 Worker dry-run 打包。

3. **会员状态并发与终身编号模型**
   - `apps/api/src/lib/membership.ts` 以预读 row / 核验状态决定后续激活；核验、缴费和最终激活不在一个完整原子流程中。顺序测试不能排除并发漏激活或旧状态覆盖，需补并发复现测试。
   - 单条 UPDATE 的编号分配不等于整个会员状态流程具有并发安全性。
   - 当前 `unique(org_id, member_no)` 建在按届多行的 membership 上，同一人在新届复用旧编号会违反唯一约束；新行自动分配又会违背“终身不换号”。
   - 建议新增稳定 `org_member`（或等价身份表），由其持有 `unique(org_id,user_id)` 与 `unique(org_id,member_no)`，membership 只记录每届资格。迁移前确认历史数据与编号，保留已有号码。
   - 明确每级三位序号耗尽、续费断档、expired/revoked 的策略；不能静默溢出至下一级。

4. **AI 预算约束不足**
   - `apps/api/src/routes/ai.ts` 先检查历史用量，推理结束后记账；没有输入总长、消息数量及显式输出预算，单次大请求和并发可能超额。
   - 现有 AI 测试是权限 / 配额拒绝路径，未覆盖成功记账、上游失败、并发和跨日结算。
   - 增加请求限制、最大输出、超时、原子额度预留与结算 / 释放、失败恢复；初期保持非流式，先保证正确性。
   - 当前“全局”聚合按 org 过滤；未来多租户或同账号其他服务不能依靠它实现账号级封顶。
   - 内部配额单位与供应商实际费用分开说明；实际成本对账与账号级告警另设。

5. **基础防滥用与数据完整性**
   - 注册 / 登录尚未见应用级限流；密码及请求体应设上限，邮箱需有明确规范化与校内域核验策略。
   - 注册的 user、membership、session 分步写入，应处理失败残留与并发重复邮箱的 409 映射。
   - 资源上传先 parseBody 再 arrayBuffer，未见文件大小限制；添加解析前请求体限制、文件策略及上传配额。
   - R2 与 D1 无跨服务事务，上传 / 删除需有补偿或可恢复状态，避免孤儿对象或元数据指向缺失文件。

### P1：上线体验与维护能力

- 决定官网搜索交付模式：`/api/search` 是 server loader，且被排除预渲染；若只部署静态产物，需改静态索引 / 客户端搜索，或明确提供服务端运行时。中文搜索也需验收。
- 验证 Expo Web 静态托管下 `/u/:id`、`/verify/:serial`、`/checkin`、admin 深链与刷新；不能只测站内点击。
- 统一请求超时、取消、401 会话失效、加载 / 空 / 错误状态；不对非幂等写请求盲目重试。
- Web localStorage 中的 Bearer token 有 XSS 暴露面；确定 CSP、内容渲染策略和会话失效策略。若改 HttpOnly cookie，须先设计跨域与 CSRF，不直接局部替换。
- API 响应 DTO 与 app 手写 types 有漂移空间，如 `createPost` 声明完整 PostDetail，但写响应不包含完整详情的所有字段。优先补响应契约测试，再按需要抽出纯 DTO/Zod 共享包，勿把 ORM / Worker 运行时代码带到前端。
- 日志脱敏（Authorization、签名下载链接、签到 token 不进日志）、请求关联 ID、健康检查、错误率 / 延迟 / 用量告警。
- D1 恢复流程、R2 备份或保留策略、变更审计、前向兼容迁移与发布回退手册。
- 完成品牌配置、真实仓库链接、手机视口、键盘和无障碍检查；不先大规模 UI 重写。

### P2：稳定上线后的增量

- 管理员批量操作、续费与撤权 UI、资源分类 / 检索、成员提醒。
- 论坛已有实现，但可按运营准备程度隐藏入口，不因代码已写就强行开放。
- Wallet Pass、实体卡、多租户、RAG、原生应用分发继续后置。

## 5. 建议工作包与验收

工期为单人专注开发的粗估，须在本地基线验证和环境确认后重估，不是交付承诺。

| 顺序 | 工作包 | 预估 | 验收标准 |
| --- | --- | --- | --- |
| 1 | 本地基线与工程门禁 | 1–2 天 | 全新 checkout 可按 README 初始化；无 AI 远程调用完成 API 测试；三端类型与交付构建均有独立结果；PR 自动执行 |
| 2 | 会员状态与编号修复 | 2–3 天 | 核验 / 缴费两种顺序及并发均最终正确；跨届编号不变；重复请求不破坏状态；迁移验证不丢历史 |
| 3 | 安全、AI 预算与资源一致性 | 2–3 天 | 限流 / 大请求被拒绝；并发配额有明确上界；AI 失败可结算恢复；文件越权、超限、签名过期和存储失败有测试 |
| 4 | 预发布环境与部署收口 | 1–2 天 | 明确的环境隔离与 CORS；深链刷新 / 官网搜索可用；生产不带开发账号；迁移和回退路径可执行 |
| 5 | Web 端到端与可维护性交付 | 2 天 | Playwright 覆盖主业务链与权限拒绝；日志不含凭据；管理员操作手册和故障排查手册可用 |

主验收链：注册 → 管理员核验与缴费 → active 且编号稳定 → 卡片 → 资源 → AI 权益 → 活动签到 → 称号 / 证书 → 退出后拒绝受保护请求。

补充场景：applied 用户越权、非 admin 调后台、扫码时未登录后回跳、重复签到、证书匿名验证、其他用户删除资源 / 帖子被拒绝、移动浏览器深链刷新。

## 6. 分支与变更组织

- `ziyu/dev-maintenance` 作为 ziyu 集成分支；建议以工作包形成小 PR，不一次混入架构迁移、页面重写和新业务。
- 建议拆分主题：`chore/quality-gates`、`fix/membership-lifecycle`、`fix/quota-and-resource-guards`、`chore/preview-delivery`、`test/web-critical-paths`。这些是规划名称，尚未创建。
- 每个 PR 附：目的、接口 / schema 影响、验证结果、部署影响和回退方式。
- 接口先契约，数据库先迁移；避免为了统一版本直接升级 Expo / React Native 依赖组合。修改 app 代码前先阅读本仓库 AGENTS.md 指定的 Expo SDK 57 文档。
- 本轮只新增规划文档；未改业务代码，未提交或推送本轮变更，未创建远程环境或发布。

## 7. 待确认的产品输入

1. 首次真实使用日期及首批成员量级。
2. ziyu 是否负责全栈 / 运维，其他维护者的模块边界。
3. 生产域名、Cloudflare 账号资源归属、预算和管理员责任人。
4. 是否已存在需要保留的真实会员数据；未确认前不设计破坏性重建。
5. 续费周期、会员过期与撤权规则，以及编号的“级”是否继续使用首次入社年份后两位。

**下一步建议：先执行工作包 1，拿到可信基线，再实现会员状态与编号修复。**
