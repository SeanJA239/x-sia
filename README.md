# X-SIA

社团自有的身份 + 内容 + 权益平台。

## 结构

- `apps/api` — Hono API（Cloudflare Workers + D1 + R2 + Workers AI）
- `apps/app` — 成员端应用（Expo，web 优先）+ admin 后台
- `apps/site` — 门面站（fumadocs）
- `apps/wiki` — 动态公开知识手册（React Router SSR；草稿、发布、修订历史）
- `apps/books` — Wiki 教材源稿与离线导出工具（Markdown、公式、原创/授权插图、HTML 与 PDF）
- `docs/` — 设计稿与 API 契约

## 使用

```sh
pnpm install
pnpm --filter api dev      # API（本地 D1/R2 模拟）
pnpm --filter app web      # 成员端
pnpm --filter site dev     # 门面站
pnpm check                 # biome 格式与 lint
pnpm test                  # 全部测试
```

## 容器与制品

固定工具链：Node 24.14.0 / pnpm 10.32.1。Docker 内不需要宿主 pnpm。

```sh
docker compose -f compose.dev.yaml up --build --watch       # 本地 Wrangler + Expo + Wiki + 网关
docker compose -f compose.preview.yaml up --build -d        # 静态 Web + Node SSR 的 production-like 验证
pnpm quality && pnpm build:artifacts                       # 显式质量与制品门禁
pnpm deploy:dry-run                                       # 仅离线 Worker bundle，绝不发布
```

开发与 preview 占用相同回环端口，不能同时启动。生产 API 始终是 Cloudflare Worker；
生产 Compose 只承载 portal/Wiki/Site，真实部署命令默认封闭。
见 [部署架构](docs/deployment-architecture.md) 和 [完整操作、安全边界及验证限制](docs/deployment-operations.md)。

## Wiki 本地联调

入口 `http://localhost:8787/wiki/`；独立前端复用现有 Hono API 和账号。

分别启动 `pnpm dev:wiki-api`（8788）、`pnpm dev:wiki`（8082）、`pnpm dev:gateway`（8787）。
首次需执行本地迁移；现有调试服务已在运行时不要重复启动。
完整初始化、权限、Markdown 上传和测试说明见 [apps/wiki/README.md](apps/wiki/README.md)，接口见 [docs/wiki-api-contract.md](docs/wiki-api-contract.md)。

## 工程基础丛书

Wiki 原生涵盖 Linux、服务器、嵌入式、计算机系统、数学和编程语言。当前 36 章、约 8.5 万汉字、66 幅正文图。Linux 入口已扩为七篇十四章，涵盖 OS、内核、线程调度、内存 I/O、两类流水线和编译系统；另将李博杰 AI Infra 原著的 16 个小节与 24 幅授权原图选编进六个已有章节。语言模块覆盖 C、C++、Python、Java、HTML/CSS/JavaScript 和 Rust。11 条独立教材路线及中外参考在 `/wiki/paths`；AI Infra 全书归类与实际选编状态在 `/wiki/paths#ai-infra-map`，计划不计入已写正文。

```sh
pnpm books:build           # 构建带公式和插图的静态电子书
pnpm dev:books             # 回环预览 8083，正文变更后自动重建
pnpm books:test            # 内容结构、数学渲染、链接与算例检查
pnpm books:pdf             # 导出当前各卷 PDF；默认使用已安装 Edge
```

阅读入口 **`http://localhost:8787/wiki/`**；所有教材原生显示在 Wiki 中，不跳转独立书站，不依赖 8083。
语言模块：`/wiki/learn/languages`；路线与参考：`/wiki/paths`；整卷阅读与打印：`/wiki/learn/:volume/print`。
`apps/books` 保留为教材唯一源文件与可选离线导出工程。正文仍以 Markdown 维护，社区 D1 条目保留网页编辑功能。详见 [书籍工程与编辑指南](apps/books/README.md) 与 [教材化建设计划](docs/wiki-textbook-program.md)。
