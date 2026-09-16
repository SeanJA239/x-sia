# 容器、制品与发布操作

架构事实来源：[deployment-architecture.md](deployment-architecture.md)。本文提供实现命令；**没有执行过公网部署**。

## 工具链与边界

- Node **24.14.0**、pnpm **10.32.1**（`.node-version`、根 `packageManager`、Dockerfile 一致）；安装使用 `--frozen-lockfile`，不重新解析依赖版本。
- Docker BuildKit、Compose **2.32+**（使用 `develop.watch`）；本机无 pnpm 也可直接使用 Docker。
- Node/Docker 基础镜像固定补丁标签；正式发布 CI 还应解析、审核并固定镜像 digest，扫描漏洞/SBOM。当前不是逐字节可复现或供应链已审计的声明。
- Docker 构建上下文使用源码 allowlist，排除 `.env*`、`.dev.vars*`、凭据、宿主依赖和生成状态。**不要把密钥放进源码目录、构建参数或 EXPO_PUBLIC_*。** 私有依赖如需鉴权，应另行增加 BuildKit secret mount，不能 ARG/COPY token。
- runtime 非 root，Compose 丢弃 capabilities、禁止提权、只读根文件系统；SSR 仅有生产依赖、`package.json` 和对应 `build/`。API 生产只能是 Cloudflare Worker。

## 1. 开发 Compose

```sh
docker compose -f compose.dev.yaml up --build --watch
# 可选独立官网和离线教材预览：
docker compose -f compose.dev.yaml --profile site --profile books up --build --watch
```

唯一成员/Wiki 浏览器入口 `http://localhost:8787`；Wiki `/wiki/`，可选 Books `/books/`。官网独占 `http://localhost:8084`，不与成员端抢 `/`。只发布宿主回环端口，不开放局域网。

API 首次/每次启动使用 **同一个 `wrangler.test.jsonc` + `--local`** 幂等应用迁移，然后启动 Wrangler local。该配置没有 AI，`test-sign-secret` 仅为公开本地测试常量，不能用于生产。D1/R2 是模拟状态，保存在 `wrangler_state` 命名卷；没有自动 seed。

当前 API 中间件要求存在 `x-sia` org，空库只有迁移时业务 API 会返回 500；因此 API healthcheck 只探测根路径的预期 404 来确认 Worker 活着，不以自动 seed 掩盖初始化要求。要验证本地登录/社区，需显式执行下面的开发 seed；它会创建 org 与演示数据，不得用于生产。

```sh
docker compose -f compose.dev.yaml exec api pnpm exec wrangler d1 execute x-sia-db --config wrangler.test.jsonc --local --file ./seed.sql
```

`deps` 初始化/更新命名卷中的 pnpm 依赖后，应用才启动。代码来自过滤后的构建上下文，不绑定整个含密钥的工作树；`--watch` 同步源码并排除密钥/生成文件。修改 package/lock、Compose、Dockerfile 或工具链后：

```sh
docker compose -f compose.dev.yaml down
docker compose -f compose.dev.yaml build
docker compose -f compose.dev.yaml up --force-recreate --watch
```

这会重新运行 `deps` 的 frozen install。不要只换镜像后沿用未更新的 node_modules 卷。`down` 保留数据；**`down -v` 会清空本地 D1/R2 和依赖卷**。

宿主原生调试仍使用原有默认行为。新增可选变量见根 `.env.example`：

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `GATEWAY_HOST` / `GATEWAY_PORT` | `127.0.0.1` / `8787` | 开发网关监听 |
| `GATEWAY_{API,APP,WIKI,BOOKS}_ORIGIN` | `http://127.0.0.1:{8788,8081,8082,8083}` | HTTP 与 WebSocket 共用上游；只接受无凭据/路径的 HTTP origin |
| `BOOKS_HOST` / `BOOKS_PORT` | `127.0.0.1` / `8083` | 教材预览监听 |
| `BOOKS_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | 精确 Host 白名单，逗号分隔、不含端口、不允许 `*` |
| `WIKI_API_ORIGIN` | `http://127.0.0.1:8788` | Wiki SSR 与开发 API proxy |

这些脚本不会自动加载根 `.env`；宿主运行需显式设置环境变量。容器内部监听 `0.0.0.0` 不等于允许公网访问。不要把开发网关当生产 ingress；不要用真实凭据测试这些日志路径。

## 2. 明确的本地/CI 门禁

```sh
pnpm install --frozen-lockfile
pnpm quality              # check、部署回归、API 类型/测试、App 类型、Books 测试、Wiki/Site 类型
pnpm build:artifacts      # Web export、Books HTML、Wiki/Site SSR、Worker offline dry-run
pnpm smoke:production     # Wiki 生产 SSR/教材断网 smoke，需要 Playwright 浏览器
pnpm docker:config        # dev/preview Compose config --quiet，不打印展开环境
pnpm docker:quality       # 在固定工具链里执行相同 quality
pnpm docker:build         # 构建 production-like 的全部镜像
```

已有 Wiki smoke 默认需要 Edge；CI 安装支持的浏览器后可设 `WIKI_BROWSER_CHANNEL=chromium`。PDF 为额外构建任务 `pnpm books:pdf`，需按 [Books 文档](../apps/books/README.md) 安装并指定浏览器；标准镜像不捆绑浏览器，也不声称生成了 PDF。

`pnpm build:web` 禁用 Expo dotenv，强制 `EXPO_PUBLIC_API_URL=''`、`EXPO_PUBLIC_WIKI_URL=/wiki/`。`web.output=single` 仍产出纯静态 `dist/`，不运行 Expo 生产服务；任意 `/u/:id`、`/verify/:serial`、帖子深链由 Caddy fallback 到 SPA。原有 `static` 逐页导出需要穷举动态参数，不适合这类运行期 ID；没有增加业务预取或改写路由。原生端未来通过 EAS 单独构建，公开 API URL 不能使用 Docker DNS 名。

## 3. Production-like（不是生产 API）

先停开发 Compose，避免 8787/8084 冲突：

```sh
docker compose -f compose.preview.yaml up --build -d
docker compose -f compose.preview.yaml ps
curl --fail http://localhost:8787/healthz
curl --fail http://localhost:8787/u/container-smoke
curl --fail http://localhost:8787/verify/container-smoke
curl --fail http://localhost:8787/wiki/learn/math/linear
curl --fail http://localhost:8084/
```

默认 API 仍是无 AI 的 Wrangler local；SSR 与 Caddy 使用相同 `http://api:8788`。可通过非敏感 `API_ORIGIN=https://实际预发布Worker域名` 指向已获授权的预发布服务；该选择会访问远端，不属于离线验证。可仅启动 `api` 以外镜像：`docker compose -f compose.preview.yaml up --build --no-deps wiki site portal`（必须先提供可达的预发布 origin）。

Caddy 原样保留 `/api/v1`、`/wiki` 前缀；对 HTTPS Worker 设置正确 Host/SNI（默认验证 TLS，不跳过证书验证）。API 响应 `no-store`，不启用访问日志；静态文件回退仅在成员端生效，API/Wiki 不会落到 SPA。Books 在 portal 中明确 404。

浏览器人工 smoke：登录成员端 → 点击 Wiki → 验证 `x-sia:token` 会话复用及同源 `/api/v1`；刷新动态深链、检查 Wiki JS/CSS/字体/SVG、检查 SSR 在关闭 JS 时仍显示教材、确认 `/books/` 不成为依赖。**不要复制、打印或把真实 token 写入报告。** `healthz` 只代表 portal 活着，不代表 API 绑定或鉴权正常。网关 Node 测试不代替真实 Metro/Vite HMR 浏览器测试。

## 4. 制品

```sh
docker build --target artifacts --output type=local,dest=.artifacts/export .
docker build --target portal -t x-sia-portal:review .
docker build --target wiki -t x-sia-wiki:review .
docker build --target site -t x-sia-site:review .
```

| 制品 | 宿主构建路径 | Docker 导出 |
| --- | --- | --- |
| Expo 同源静态 Web | `apps/app/dist/` | `.artifacts/export/web/` |
| Books HTML/校验报告 | `apps/books/dist/` | `.artifacts/export/books/` |
| Worker bundle、migrations、非敏感配置模板 | `.artifacts/worker/` | `.artifacts/export/worker/` |
| Wiki/Site | 对应 OCI 镜像 | 镜像内 build + production node_modules，不单独上传 build 到 Workers |

教材只来自 `apps/books/content/`；Wiki build 内打包 Markdown/图/字体，runtime 不挂载 Books 目录、不连预览端口。构建默认不发布/推送镜像，不提交 Git。

## 5. Worker dry-run 与 fail-closed 发布边界

```sh
pnpm deploy:dry-run
pnpm deploy:check          # 缺输入时非零退出；仅检查非敏感 metadata
pnpm deploy:production     # 永远拒绝真实发布，即使输入完整
```

API 包原先的裸 `deploy` 也改为拒绝命令。`deploy:dry-run` 在临时目录生成配置，使用临时 HOME/隔离环境，无 `.env`、`.dev.vars`、账户 token 或登录缓存；唯一 Wrangler 动作为 `deploy --dry-run --env production`。使用明确 dummy D1 ID，不调用远程迁移、AI 或上传。产物内的模板仍为 `REQUIRED_*`，不能直接生产使用；失败会删除不完整产物。

`deploy:check` 要求：显式 `DEPLOY_ENV=production`、合法且非 dummy 的账户/D1 ID、明确 DB/R2/Worker 名、非占位公网 HTTPS Worker origin、三个 `@sha256:` OCI 引用、与环境一致的 `SIGN_SECRET_PROVISIONED` 和 `MIGRATIONS_REVIEWED`。输入字段见 `.env.example`，检查不打印值、不读取 secret。两项标记只是资源所有者的确认，**不是对远端 secret/备份存在性的证明**，所以仓库不根据标记自动解锁部署。

**生产必须由资源所有者另行完成（以下不是本实现执行过的动作）：**

1. 审批 CI 门禁结果、镜像 digest、实际域名和 TLS 入口；创建/选择 D1/R2/Worker，并核对 account。不要使用测试配置。
2. 从 `docker/wrangler.production.example.json` 在受控发布目录生成独立配置：填全 `env.production` 绑定、account 和 `name`，添加明确 `routes`/custom domain；`main` 指向已审核 Worker bundle，`migrations_dir` 指向随制品交付的 migrations。不能用 `wrangler deploy --var` 注入 D1 database ID；绑定必须写在该命名环境配置里。
3. Cloudflare token 只由 CI secret store 注入发布 job；所有者通过 `wrangler secret put SIGN_SECRET --env production --config <已审核配置>` 的安全交互/平台机制配置 Worker secret。不要用命令行参数、Compose `.env` 或构建参数传 secret，不在报告记录值。
4. 备份/检查 D1，在维护审批下以该明确环境配置执行 **远端 migrations apply**，绝不运行 `seed.sql`。先迁移再发布兼容 Worker；不可逆迁移需要独立恢复计划。
5. 所有者先对真实配置执行 Worker dry-run，再人工批准真实 `wrangler deploy --env production --config <已审核配置>`。平台设置/验证 API 域名、bindings、AI 权限；dry-run 不能验证这些外部资源。
6. 在独立发布基础设施推送并签名已审核 OCI 镜像，保存 digest；本仓库命令不执行 push。
7. 提供只含非敏感配置的外部 env 文件和上述检查变量，执行 `pnpm deploy:check` 与 `docker compose --env-file <外部非敏感文件> -f compose.production.yaml config --quiet`。检查脚本不加载 env 文件，需发布平台将同一份非敏感值注入其环境。
8. 所有者才可启动 **独立的** `compose.production.yaml`。它无 build、无 API/Books/网关、无业务持久卷；不是 preview override。不要把 compose 的变量存在性检查误当成完整发布批准。
9. 外部 HTTPS ingress 将 `portal` 域名导向回环 8787，将独立官网域名导向回环 8084，保留 Host/正确转发协议；若 ingress 本身在另一个容器网络，需由运维显式连接网络而非放开公网端口。Caddy 只监听内部 HTTP 8080，不自动签发证书。成员端和 Wiki 永远在同一个浏览器 Origin。
10. 执行匿名/鉴权 smoke、监控、记录非敏感版本信息。回滚 Node/portal 使用上一个 digest；Worker 与 D1 回滚需遵循兼容性/数据恢复方案，不能简单把数据库降级。

不读取密钥的本地工具无法确认线上 secret 是否正确，也无法证明没有其他人直接调用底层 CLI；真正的生产发布权限应由 CI 身份、Cloudflare RBAC 和人工批准控制。

## 6. 本次实现验证记录

- 当前宿主只有 Node `v26.7.0`，无全局 pnpm、Docker、Corepack；不是固定构建工具链。验证通过 npm 临时运行锁定的 pnpm 10.32.1，因此出现预期的 Node engine 警告；镜像仍固定 Node 24.14.0。
- 完整 `pnpm quality` 已通过：Biome 全仓 240 个纳入管理文件、4 项部署回归、API 类型与 51 项测试、App 类型、Books 18 项测试、Wiki/Site 类型。授权上游原图、其逐字节发布副本及来源清单由 Books 的 SHA256、许可和 SVG 安全测试负责，Biome 明确排除这些不可格式化的档案，避免修改原始字节。
- `pnpm build:artifacts` 已通过：Expo Web single export、Books、Wiki/Site SSR 和 Wrangler 离线 dry-run 均生成制品。Wiki/Site 的 lockfile 模式 production dependencies 已离线打包，并分别用独立目录启动，SSR 返回预期正文。
- `WIKI_BROWSER_CHANNEL=chromium pnpm smoke:production` 已通过：社区 API 不可用时，教材 SSR、字体和图片仍可读取。首次默认 Edge 运行因宿主未安装 Edge 失败，随后安装 Playwright Chromium 后按支持的 channel 重跑通过。
- 未运行 Docker/Compose/Caddy 原生解析与镜像构建、开发 HMR/登录会话浏览器 smoke 或 PDF；宿主没有 Docker。YAML 已由 Ruby parser 解析，Docker 拓扑另由部署回归静态约束覆盖，但不能替代真实 BuildKit/Compose/Caddy 验证。
- 按 Expo 子目录要求访问 `https://docs.expo.dev/versions/v57.0.0/` 返回 HTTP 404；已阅读可达的官方 [静态渲染文档](https://docs.expo.dev/router/web/static-rendering/) 与动态路由限制。具体 Expo 57 导出兼容性仍须实际构建确认。
