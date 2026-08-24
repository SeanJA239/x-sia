# X-SIA 社团平台 — 设计稿

> 本文取代此前的《项目信息整理》与《软件产品描述》。那两份里的 NTAG 424 DNA 方案、Wallet Pass 作为主身份载体、纯 PWA、「多租户是过度设计」等结论**已被推翻**，勿参考。
> 招新/缴费流程本轮暂缓，本文只覆盖平台本体。

---

## 1. 定位与边界

社团自有的**身份 + 内容 + 权益**平台。社团内部工具起步，效果好则扩展到其他社团——因此多租户从第一天在数据模型里预留，但不实现主题/部署层的多租户。

**明确不做**：支付集成、门禁、原生 App 分发为主、多租户主题容器、匿名发帖（第一年）。

---

## 2. 系统拓扑

三个部署单元，一套身份：

| 单元 | 内容 | 技术 |
|---|---|---|
| **门面站** | 社团介绍、官方文章、LinkCode 推广、活动回顾归档 | fumadocs + Tanstack Start / React Router，静态，CF Pages |
| **应用** | UGC、成员主页、活动签到、资源、AI Chat | Expo（web 优先）+ Hono API |
| **数据** | 全部结构化数据 / 文件 | D1（SQLite）+ Drizzle；R2 存文件 |

**fumadocs 不要用 Next.js**——部署到 Workers 要过 OpenNext 那层，Vite 系框架直接就能上。fumadocs v16 已默认切到 Shiki 的 JS 正则引擎，正是为了 Workers 兼容。

**内容分流原则**：编辑型内容（少数人写、走 git、要 SEO）进 fumadocs；UGC（多数人写、运行时、要鉴权审核）进 D1。fumadocs 是构建时文件系统模型，成员发帖不可能触发重新构建，不要试图用它承载 UGC。

AI 网关是 Hono 里的一组路由，不必独立部署。

---

## 3. 数据模型

### 3.1 租户与身份

```
org              id, slug, name, email_domains[], created_at
user             id, email(unique), display_name, avatar, 
                 email_verified_at, verified_by('self'|'manual'), created_at
session          id, user_id, token_hash, expires_at, created_at
```

- `unique(email)` 是防小号机制。一人一个校内邮箱，这个约束基本等价于实名唯一性。
- `email_domains` 是 per-org 配置，不硬编码。本科/研究生后缀可能不同，需确认学校实际有几种。
- `verified_by` 记录是自助验证还是人工核验，两条路径都要留。
- 邮箱只在注册时快照。校内邮箱毕业后可能回收，身份判定看 `email_verified_at` 的快照，不看邮箱当前是否可用——否则毕业生账号会失效，或被拿到回收邮箱的新生「继承」。

### 3.2 社员资格

```
membership       id, org_id, user_id, term, status, member_no,
                 paid_confirmed_at, paid_confirmed_by,
                 in_group_at, in_group_by, created_at
```

- `status`: `applied | pending_payment | active | expired | revoked`（预留 `reviewing`，第一年不用）
- **按届（term）多行**，不是 user 表上的布尔字段。续费换一届，账号不变，历史留存。
- `member_no`：社员编号，`unique(org_id, term, member_no)`。在 `status` 首次变为 `active` 时按顺序分配，**分配后永不变更**。详见 §7 归属感设计——这个字段必须在阶段一就存在，它是入社顺序的函数，事后补发就失去全部意义。
- `paid_confirmed` 与 `in_group` 是**两个独立标记**，都是纯人工动作，一定会漏人。分开存才能让「缴了费没进群」的人在 admin 列表里可见。
- 所有人工授权动作记 `_by` 和 `_at`，出争议能追。

### 3.3 权益

```
entitlement      id, org_id, user_id, kind, tier, granted_at, expires_at, revoked_at
ai_usage         id, user_id, model, neurons, created_at
```

- 权益是独立条目，与角色解耦。AI 额度档位、称号、证书资格、活动优先级都是可单独授予/回收的记录。
- `ai_usage` 是流水账，配额判定靠聚合查询（量级小，不必预聚合）。

### 3.4 内容

```
post             id, org_id, author_id, kind('wall'|'article'), title, body_md,
                 status('draft'|'published'|'removed'), created_at
comment          id, post_id, author_id, body, created_at
resource         id, org_id, uploader_id, title, r2_key, size, mime,
                 visibility('member'|'public'), created_at
```

### 3.5 活动

```
event            id, org_id, title, starts_at, ends_at, location, 
                 checkin_secret, luma_id
attendance       id, event_id, user_id, checked_in_at, method
```

### 3.6 荣誉与审计

```
title_def        id, org_id, name, rule_json
user_title       id, user_id, title_def_id, granted_at
certificate      id, org_id, user_id, event_id, serial(unique), issued_at
audit_log        id, org_id, actor_id, action, target_type, target_id, meta, created_at
```

### 3.7 Wallet Pass（阶段四，但表结构在此列出）

```
pass             id, org_id, user_id, serial(unique), auth_token_hash,
                 last_updated_at
pass_device      id, pass_id, device_library_id, push_token, registered_at
```

- `pass_device` 支撑 PassKit 的 web service 协议。**同一台设备重装或从备份恢复后会用新的 push token 重新注册同一张 pass**，必须以最新注册为准并清理旧记录，否则会持续向早已失效的 token 推送。
- 推送必须走 APNs 的 HTTP/2 接口，旧的二进制协议已于 2021 年退役。

`certificate.serial` 走可验证链接（`/verify/:serial` 公开可查），这比一张图片有意义得多。

**所有业务表带 `org_id`。** 成本近乎零，后补要改全表。

---

## 4. 鉴权

### 4.1 会话

Hono 中间件校验 session token（存 `token_hash`，不存明文）。角色由 `membership.status` + `entitlement` 实时推导，不在 session 里固化——否则撤权要等 session 过期。

### 4.2 签到凭证（本轮改动）

**方向：学生扫活动码，不是干事扫学生码。**

- 现场屏幕（笔记本/投影/干事手机）显示活动二维码，内容为 `HMAC(event.checkin_secret, event_id + time_window)`，30–60 秒轮转。
- 学生用已登录的 portal 扫码 → 提交 token → 服务端验签 + 校验时间窗 + 校验 event 时间范围 → 写 attendance。

这样身份由学生自己的 session 保证，天然可信；一个码服务全场，无排队；截图转发到群里的码 30 秒后失效。学生端消耗自己的网络，不依赖现场设备。

**降级路径**：现场网络不可用时，干事在 admin 里手动补录，`attendance.method = 'manual'`。别为离线场景设计复杂方案，社团规模下人工补录是最优解。

### 4.3 身份二维码

成员个人页上的静态身份码（含 user_id）只用于**展示与人工核验**（比如综管确认身份），不作为签到凭证，因此不需要轮转。两种码用途分开，别混。

---

## 5. AI 网关

- 社团持**单一 Cloudflare 账号**，成员不接触 API Key，全部经 Hono 网关代理。
- Workers AI 免费额度 10,000 Neurons/天是**账号级**，百人共享，人均极少。网关必须有：按人配额上限、全局熔断、异常用量告警。
- 建议升级 Workers Paid（$5/月），让溢出可付费而非直接报错。在两万预算里可忽略。
- 模型策略：小模型（1B/3B 级）承担日常 Chat，大模型限定场景。
- 「我的权益」页实时显示额度余量——收了 150 元社费，交付感必须可见。

---

## 6. 资源共享

- 文件存 R2，D1 只存元数据与 R2 key。
- 下载走签发的短时效预签名 URL，不暴露 R2 直链。
- 默认 `visibility = 'member'`：登录且 `membership.status = active` 才能下载。这让资源同时成为社费权益和入社动机。
- 上传需注意版权与学术诚信边界，建议保留下架能力和上传者归属记录。

---

## 7. 身份载体与归属感设计

鉴权只是这块的底线要求，真正的目标是**炫和体验感**。以下是三种载体的分工与设计原则。

### 7.1 核心判断：归属感来自「卡面会变」

静态卡就是一张图，看两次就腻。有生命的身份是会随着你在社团里的行为而改变的——升了称号、攒了出勤、额度还剩多少、下一场活动在哪。**所有载体的设计都应服务于这一点**，能动态更新的优先。

### 7.2 载体分工

| 载体 | 定位 | 说明 |
|---|---|---|
| **网页卡片** | **主形态** | 全平台一致，上限最高 |
| **Wallet Pass** | iPhone 增益 | 由我们签发的真 .pkpass |
| **实体卡** | 纪念/仪式感 | 普通 NTAG213 + 静态个人页链接 |

网页卡片不是"安卓的兜底"，而是主形态。它能做 Wallet Pass 做不到的事：动效、陀螺仪驱动的 3D 倾斜、渐变、粒子、实时数据——Pass 的渲染由 Apple 定死，网页是我们自己的画布。

实现要点：**独立的全屏路由**（不是个人页上的一个组件），配合"添加到主屏幕"，打开即整屏卡片。

### 7.3 Wallet Pass：自己签发，不要用 Create a Pass

iOS 27 新增的 **Create a Pass** 是用户侧工具——用户在 Wallet 里点「+」，用 Visual Intelligence 扫描实体卡或二维码自行生成通行证，可自选图片、颜色、样式，分活动（紫）/会员（蓝）/其他（橙）三类。

**不要走这条路。** 它生成的是本地静态 pass，没有 `webServiceURL`，因此：不会自动更新、卡面由用户自己决定（无法统一社团视觉）、无法撤销。它恰恰丢掉了 §7.1 里全部有价值的东西——那是给没有开发能力的商家兜底的方案。

**我们直接签发 .pkpass。** 再次明确：被 Apple 卡死的只有 `nfc` 字段（需特批证书，社团拿不到），**条码 Pass 任何开发者账号都能签发**。

动态更新机制：pass.json 写入 `webServiceURL` + `authenticationToken` → 设备安装时向我们的服务注册（deviceLibraryIdentifier + pushToken，见 §3.7）→ 数据变更时向 APNs 推一条**空 payload** 的静默通知 → 推送只是叫醒信号，Wallet 收到后回查哪些 serialNumber 变了，再逐个拉最新 .pkpass。字段带 `changeMessage` 会在锁屏弹提示，不带则静默更新。

### 7.4 iOS 27 里真正可用的两条

- **Pass Designer**：Apple 官方 macOS 应用，用于创建和预览 pass，macOS 27 上以测试版提供。直接降低 pkpass 的制作门槛，不必手写 pass.json + 命令行签名反复试。
- **增强版 pass 设计扩展到 membership 类型**：iOS 26 的增强登机牌设计在 iOS 27 中扩展到忠诚卡、奖励卡、会员卡、礼品卡，背景图更精细、下方带信息瓦片。我们的社员卡属于 membership 类型，白送的视觉升级。

（另：iOS 27 新增支持 EAN-13、Code 39、Codabar、ITF 四种条码类型，我们用 QR 即可，无关。）

### 7.5 卡面内容规划

- **主字段：称号（title）** —— 升级时带 `changeMessage` 推送，锁屏直接弹「你已成为 XX」
- **副字段：社员编号 `member_no`** —— #001 到 #100，按入社顺序发放，先到先得。零成本但极有效：早期成员的编号本身是身份资产，同时天然制造招新期的紧迫感。**必须在阶段一进数据模型**
- 届别、加入日期、AI 额度余量、出勤次数
- **背面**：社团简介、群二维码、权益清单

### 7.6 最"炫"的那个时刻

给 pass 挂上活动地点的**地理围栏**（一张 pass 最多 10 个 location），持卡人走近现场时 Wallet 自动把卡浮到锁屏上——不需要打开任何 App，不需要通知权限。一年只发生几次，但每次都会被记住。

### 7.7 设计系统

实体卡卡面、Wallet Pass、网页卡片应当是**同一套视觉语言的三种载体**，一起设计而非各做各的。参考 United Portal 的做法——他们的质感有很大比例来自设计系统的前期投入（自制字体、组件库）。这部分投入的回报直接体现在招新转化和成员认同上。

---

## 8. 实现顺序

**阶段一（地基）**
1. org / user / session + 注册登录（第一年现场人肉核验，不发验证邮件）
2. membership 状态机（**含 `member_no` 分配**）+ admin 确认界面
3. 成员个人页 + 身份二维码
4. **视觉语言定稿**（配色、字体、卡面构图）—— 卡出现在哪个载体上都要用它，越早定越省事
5. fumadocs 门面站上线（介绍、指南、2–3 篇文章）

**阶段二（权益交付）**

6. AI 网关 + 配额账本 + 「我的权益」页
7. 资源共享（读为主，上传可粗糙）
8. **网页卡片全屏路由** —— 主形态，动效可以后续迭代，先把静态版立起来

**阶段三（沉淀）**

9. 活动 + 轮转码签到
10. 论坛 / 墙
11. title / cert（title 一旦有了，网页卡片就开始"会变"）

**阶段四**
Wallet Pass（.pkpass 签发 + web service + APNs 更新 + 地理围栏）、实体卡、RAG 招新机器人、多租户

**论坛必须后置。** 没人的论坛是空房子，上线即负分。等有了成员再开，用真人填充。

**归属感的实现是渐进的**：阶段一给编号，阶段二给可看的卡，阶段三让卡开始变，阶段四让卡跳到锁屏上。每一阶段都有可交付的体验增量，不必等全做完。

---

## 9. 未决项

- **时间线** —— 全程未确认。这直接决定阶段二之后砍到哪里。
- 命名（社团 X-SIA / 软件名）
- 旧的校园论坛+资料共享平台是否复用：技术栈、鉴权方式、代码是否可运行
- 干事人力与技术构成（fumadocs 编辑需要 git + MDX，能写的人有几个）
- Luma 是确定选型还是候选
- title 规则、cert 性质
- 发信方案（暂缓，现场路径不依赖邮件；异步验证可考虑反向验证：用户从校内邮箱发信到 `verify+<token>@域名`，Email Worker 处理，零出站）
- **Apple Developer 账号**：签发 .pkpass 需要付费开发者账号（$99/年，约 700 元）+ Pass Type ID 证书。在两万预算内可承受，但需确认由谁持有、续费责任归属——这是唯一有年度续费义务的外部依赖，换届时容易断
- `member_no` 的分配口径：是否按届重置（#001 每年重来），还是全社团永久递增（老社员编号不变）。两种都合理但含义完全不同，且事后无法改
- 视觉语言由谁定稿——这是阶段一的交付物之一，但需要设计能力而非开发能力
