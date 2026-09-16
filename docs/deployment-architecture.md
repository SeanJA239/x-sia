# X-SIA 运行、容器与发布架构

## 1. 目标与原则

本文是当前仓库的部署事实来源，区分源码职责、本地联调容器、生产运行单元和可上传制品。

核心原则：

1. Cloudflare 原生能力继续运行在 Cloudflare，不为“全 Docker”重写 D1、R2 或 Workers AI。
2. Docker 用于固定 Node/pnpm 工具链、复现联调环境，以及承载真正需要常驻 Node 进程的 SSR 应用。
3. 成员 Web 与 Wiki 必须位于同一个浏览器 Origin。当前两端共享 `x-sia:token` localStorage，并由 Wiki 浏览器请求同源 `/api/v1`；拆成不同子域会丢失会话共享。
4. 教材只有一个源：`apps/books/content/`。Wiki 在构建时打包教材；`books` 的 HTML/PDF 是离线制品，不是 Wiki 的生产依赖。
5. 开发网关只用于本地联调；生产入口使用 Caddy/等价 ingress，负责 TLS 后的路径路由、静态文件和反向代理。
6. 密钥不进入镜像、Git 或构建参数。Cloudflare secret、部署平台 secret 和运行时环境变量分别管理。

## 2. 组件职责与交付形式

| 组件 | 职责 | 本地容器 | 生产形态 | 可上传制品 |
| --- | --- | --- | --- | --- |
| `apps/api` | Hono API、鉴权、D1 数据、R2 文件、Workers AI | Wrangler local；D1/R2 状态持久卷；测试配置不连远程 AI | **Cloudflare Worker**，不是常驻 Docker 服务 | Worker bundle；D1 migrations；Wrangler 配置 |
| `apps/app` | 成员端、管理员端、公开身份/证书页；Expo 原生与 Web | Expo Metro 调试容器 | Web 执行 `expo export` 后由 portal 静态服务；iOS/Android 后续走 EAS/应用商店 | `apps/app/dist/`；原生 EAS artifact（后续） |
| `apps/wiki` | 教材阅读、社区 Wiki SSR、编辑工作台 | React Router dev server | **Node SSR 容器**；`/wiki/*` 保留完整前缀 | OCI image；`build/` 仅与对应 runtime/dependencies 一起交付 |
| `apps/site` | 官网、文档、博客、搜索与 OG 路由 | 独立 dev server，不占 portal 根路由 | **独立 Node SSR 容器/服务**；建议域名 `www` 或 apex | OCI image；若未来移除动态搜索/OG，可改纯静态制品 |
| `apps/books` | 教材 Markdown、公式/图片校验、静态书与 PDF 导出 | 可选 preview/test 容器 | 不常驻；作为 CI 构建任务 | `dist/` 静态电子书、PDF、校验报告 |
| `scripts/dev-gateway.mjs` | 本地同源路由及 HMR/WebSocket 转发 | Compose 默认入口 | 不部署生产 | 无 |
| `docker/Caddyfile` | 生产 portal：静态成员 Web、Wiki SSR、API Worker 反代 | 可作 production-like smoke | **portal ingress 容器** | Caddy image/config |

## 3. 推荐域名与请求拓扑

```text
https://x-sia.example/                 -> site Node SSR（官网）

https://portal.x-sia.example/          -> portal/Caddy -> Expo Web 静态文件
https://portal.x-sia.example/wiki/*    -> portal/Caddy -> wiki:3000
https://portal.x-sia.example/api/v1/*  -> portal/Caddy -> https://api.x-sia.example

https://api.x-sia.example/api/v1/*     -> Cloudflare Worker -> D1 / R2 / Workers AI
```

浏览器始终在 `portal.x-sia.example` 下访问成员端、Wiki 和代理后的 API，现有 localStorage token 无需跨域复制。portal 到 Worker 是服务端反代；Worker 的公开 API 域名仍可供原生 App 使用。

不要把官网和成员端同时部署在同一域名根路径。当前两者都拥有 `/` 路由，强行合并会产生路由所有权冲突。

## 4. 环境分层

### 4.1 本地原生调试（最快）

适合日常开发：宿主机安装固定版本 Node/pnpm，分别启动 API、App、Wiki 和网关。优点是 HMR 快；缺点是依赖宿主环境。

### 4.2 Docker Compose 联调（可复现）

默认启动：

- `api`：Wrangler local，无 Workers AI 绑定；首次启动自动应用 migrations，不自动 seed。
- `app`：Expo Web/Metro。
- `wiki`：React Router dev。
- `gateway`：唯一浏览器入口 `http://localhost:8787`。

可选 profile：

- `site`：官网调试，独立端口。
- `books`：离线书预览。

D1/R2 的 `.wrangler/state` 和 pnpm node_modules 使用命名卷。开发 seed 必须显式执行，不能在每次启动时自动灌入。

### 4.3 Production-like 本地运行

构建 portal、wiki、site 镜像；portal 使用导出的 Expo 静态文件并反代 Wiki/API。API 可以指向本地 Wrangler，也可以指向预发布 Worker。该模式用于验证静态深链、SSR、同源鉴权和反向代理，不等于公网发布。

### 4.4 生产

- API：`wrangler deploy`，部署前应用远端 D1 migration；R2/AI/D1 使用环境绑定。
- Portal/Wiki/Site：构建不可变 OCI image，推送镜像仓库，在 VPS/容器平台部署。
- 入口平台负责 HTTPS；运行容器不保存业务数据。
- Expo 原生端只配置公开 API 与 Wiki URL，不依赖 Docker 网络名。

## 5. 环境变量与密钥

### 构建期公开变量

| 变量 | 用途 |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | 原生 App 的公开 API origin；portal Web 构建使用空字符串表示同源 |
| `EXPO_PUBLIC_WIKI_URL` | 原生端 Wiki 公开 URL |

`EXPO_PUBLIC_*` 会进入客户端 bundle，禁止放密钥。

### 运行期变量

| 变量 | 组件 | 用途 |
| --- | --- | --- |
| `WIKI_API_ORIGIN` | Wiki SSR | 服务端读取公开社区 Wiki API；容器中指向 Worker origin 或本地 `api` |
| `API_ORIGIN` | portal/Caddy | `/api/v1/*` 的反代上游 |
| `HOST` / `PORT` | Wiki/Site | Node SSR 监听地址与端口 |

### Secret

- `SIGN_SECRET`：只通过 `wrangler secret put` 或部署平台 secret 注入。
- Cloudflare API token/account ID：只供 CI/deploy job 使用。
- 不在 Compose 文件中写真实 token；`.env.example` 只给非敏感占位值。

## 6. 数据与迁移

- 本地 Wrangler 状态挂载为命名卷；删除卷等于清空本地 D1/R2。
- 生产 D1 migration 是独立发布步骤，先备份/检查，再执行 migration，再发布兼容的新 Worker。
- 开发 `seed.sql` 不得在生产执行。
- R2 与 D1 没有跨服务事务，业务代码仍需处理孤儿对象和补偿；容器化不会自动解决一致性。
- Wiki/站点/portal 容器均无状态，可滚动替换。

## 7. 构建与发布门禁

最小门禁：

1. `pnpm check`
2. API typecheck + tests
3. App typecheck + Web export
4. Books tests + build
5. Wiki typecheck + build；生产 smoke 在有 Playwright 浏览器的 CI 中执行
6. Site typecheck + build
7. Docker/Compose 配置检查与镜像构建
8. 对 Worker 先 dry-run，再允许显式生产部署

公网部署脚本必须 fail closed：缺少 account、database ID、secret 或明确环境名时直接退出；不能把 `TODO` database ID 带入生产。

## 8. 当前不自动执行的外部动作

仓库自动化可以完成镜像、制品和部署命令，但下列动作需要资源所有者提供环境：

- 创建/选择 Cloudflare D1、R2、Worker route 和 DNS；
- 设置 `SIGN_SECRET` 与 CI token；
- 选择镜像仓库和容器宿主机；
- 确认真实域名和 TLS 入口；
- 执行会影响真实用户数据的 migration/生产发布。

在这些输入缺失时，自动化只能完成 dry-run 和本地/CI 验证，不得声称已部署公网。

## 9. 后续演进

1. 将 API CORS 改为按环境配置的 allowlist，供原生/必要跨域客户端使用。
2. 为 Wiki 提供 Cloudflare Workers adapter 后，可评估从 Node 容器迁移到边缘；在适配完成前不要假装当前 Node SSR bundle 可直接上传 Workers。
3. 若 Site 将搜索索引和 OG 全部静态化，可退化成纯静态上传；当前 `/api/search` 是运行时 loader，因此保留 SSR。
4. 建立 GitHub Actions：质量门禁、镜像 SBOM/漏洞扫描、签名、预发布、人工批准生产。
