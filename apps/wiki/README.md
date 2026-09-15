# X-SIA Wiki

独立动态 Wiki 前端：React Router SSR + Markdown 编辑器；复用 `apps/api` 的 Hono / D1 / session。

- 公开入口：`http://localhost:8787/wiki/`（网关将 `/wiki` 重定向到此处）。
- 工作台：`http://localhost:8787/wiki/manage`。
- 成员端（包括 `/activities`）已有同级 Wiki 入口，导航顺序为：首页 / 活动 / 卡片 / Wiki / 资源 / 我的。桌面顶部、手机底部均可进入；Wiki 页面也保留这些平台导航。
- `/activities` 仍是活动页；Wiki 继续使用 `/wiki/`。跨应用跳转使用普通网页链接，不交给 Expo Router，避免跳到不存在的 Expo 路由。原生端只有配置 `EXPO_PUBLIC_WIKI_URL` 后才显示 Wiki 入口；本轮验收为 Web。
- 公众无需登录；现有 admin 或 wiki_admin 可编辑/发布，wiki_editor 只可编辑。
- 教材已根据先前读取的 Notion 框架重新撰写并原生纳入 Wiki。本轮不写 Notion、不自动公开部署。

## 原生系统教材与语言模块

首页直接包含六个模块、36 章正文。Linux 与计算机系统采用七篇十四章，覆盖 OS、内核、线程调度、内存 I/O、CPU/软件流水线、编译链接和系统观测；其余服务器、嵌入式、计算机系统、数学和语言模块继续保留。所有章节、公式、插图和导航保持在 `/wiki/`，没有 iframe 或独立书站外跳。

- 卷目录：`/wiki/learn/:volume`。
- 章节：`/wiki/learn/:volume/:chapter`。
- 整卷阅读与打印：`/wiki/learn/:volume/print`。
- 11 条独立主题路线、实际字数和中外参考：`/wiki/paths`。
- AI Infra 原著归类与选编进度：`/wiki/paths#ai-infra-map`，16 个小节（其中一个为部分节）已经进入六个实际章节，24 幅原著 SVG 本地打包；完整 Apache-2.0 许可、作者和脚注随正文保留。不是原著十二章全文镜像。
- 教材源稿：`apps/books/content/`；书目：`apps/books/catalog.json`；后续路线：`apps/books/learning-paths.json`。

正文和图片通过 Vite 打包，Wiki 生产构建无需 8083、Notion 或运行时读取书站 HTML。社区 API 暂不可用时，首页明确提示，但原生教材仍可读。添加全新源目录后如开发模块缓存未刷新，重启 Wiki 开发进程；不要绕过正文缺失检查。

教材是编写中的基础稿，尚未达到每主题完整专业教科书体量，规划目录不计入已完成正文。教材仍从 Markdown 维护，不冒充 D1 的已发布修订；社区条目编辑流程不变。

KaTeX 同时用于教材和社区 Markdown；`trust` 关闭并限制展开。只有本地打包的教材插图可显示，社区的任意远程图片仍被拦截。Rust 章三幅官方教材原图按 MIT 许可归档；另有 24 幅 AI Infra 原创图按 Apache-2.0 归档。均保留作者、固定上游版本和 SHA256，不复制原著中的第三方论文、模板、字体或实验原始记录。

篇/章来自统一 catalog；节/小节的锚点与目录使用同一 Markdown AST 规则，在解析阶段赋予稳定 ID，不使用 React 渲染次数做编号。脚注标签与引用按章隔离，保留回链 ID 与无障碍属性。桌面和手机侧栏按篇折叠，当前章所在篇自动展开。

```sh
pnpm --filter wiki test:curriculum
pnpm --filter wiki build
pnpm --filter wiki test:curriculum:production
```

原生教材测试无需管理员身份，不修改 D1：覆盖 72 个章节/视口组合、搜索、整卷、SSR、图像和无书站依赖。生产测试启动临时回环服务，验证社区 API 不可用时的教材与字体/图片，并在结束后关闭测试服务。

## 首次准备

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm --filter api exec wrangler types
pnpm --filter api exec wrangler d1 migrations apply x-sia-db --local --config wrangler.test.jsonc
```

仅对全新的本地开发库执行 seed（已有数据时不要重复）：

```sh
pnpm --filter api exec wrangler d1 execute x-sia-db --local --config wrangler.test.jsonc --file=./seed.sql
```

本地测试账号见 `docs/api-contract.md` 的 Seed 节。不要把开发 seed 或测试凭据放入生产。

## 开发启动

分别在三个终端中运行（端口已在监听时不要重复启动）：

```sh
# 终端 1：现有 Hono API，8788；仅本地 D1/R2，没有远程 AI
pnpm dev:wiki-api

# 终端 2：Wiki SSR + HMR，8082
pnpm dev:wiki

# 终端 3：统一入口，8787
pnpm dev:gateway
```

如果同时调试成员端，在第四个终端启动 Expo Web，8081；其默认 API 地址即 8787。

```sh
pnpm --filter app exec expo start --web --localhost --port 8081 --max-workers 2
```

访问 `http://localhost:8787/wiki/`。网关 `/api/v1/*` 转 8788，`/wiki/*` 转 8082，其余转 8081；支持 Wiki 与 Metro 的 WebSocket。没有运行成员端时，其余路径 502 不影响 Wiki。

`WIKI_API_ORIGIN` 是 Wiki SSR 到后端的固定服务地址，默认 `http://127.0.0.1:8788`。它不由浏览器 Host 或用户输入决定，不携带用户 session。浏览器鉴权 API 使用同域 `/api/v1` 和既有 `x-sia:token` 存储。

## 使用

1. 登录工作台，点击「新建 / 导入条目」。
2. 设置固定 Slug、标题、分类、摘要；输入 Markdown，或展开本地导入选择 `.md` / `.markdown` / `.txt`。
3. 点击「保存草稿」。草稿不会进入公开页面或搜索。
4. 有发布权限的用户点击「发布已保存草稿」。刷新公开条目即可读取，无需构建/部署。
5. 修改后再次保存，公众仍看上一发布版本；明确发布才更新。
6. 修订历史可预览旧正文，「载入为草稿」后保存生成新修订。
7. 「撤回公开版本」立即隐藏公开条目，内部历史保留。

保存冲突返回 409，编辑器保留当前输入。先「下载正文备份」，再刷新获取最新版本并人工合并。保存超时也先刷新核对，不盲目重试写入。未保存离开时有提醒。

## 首版限制

- 分类为修订中的文本标签；没有单独分类管理与层级 UI。
- 搜索是发布快照上的中文子串搜索，分页 30 条；不是 FTS / 向量检索。
- 文件导入仅在浏览器读取 UTF-8 文本，最大 400 KiB，正文最多 100000 字符；只在明确保存后上传 API。
- 暂不提供 R2 图片/PDF上传、附件、批量 ZIP、Notion 导入、Slug 改名或公开历史。社区 Markdown 中的图片显示提示，不自动读取外部图片；教材仅显示已打包的原创或授权图片。
- 原始 HTML 不渲染，不执行 MDX；链接经过 react-markdown 默认安全 URL 处理。
- 目前 React Router 构建产物为 Node SSR，不是纯静态站。Cloudflare 生产运行时适配、域名、限流、监控与完整备份恢复仍需另行完成；本轮未做公网部署。
- 公开与 SSR 页面使用 no-store，避免缓存暴露被撤回内容。后续性能优化必须同时实现缓存失效。

## 检查与构建

```sh
pnpm --filter api typecheck
pnpm --filter api exec vitest run --maxWorkers=2
pnpm --filter wiki typecheck
pnpm --filter wiki build
```

Windows 资源紧张时并行 Worker 可能启动失败，联调验证使用 `--maxWorkers=2`；不要同时执行多个 pnpm install。安装新 workspace 依赖会重建 pnpm 链接；若已启动的 Metro 报模块找不到，停止旧 Metro 后用 `--clear --max-workers 2` 重启，不要同时启动多个 Metro。

浏览器端到端验证需先启动上述三个服务，并准备浏览器（默认 Microsoft Edge；可用 `WIKI_BROWSER_CHANNEL=chrome` 切换已安装的 Chrome）。使用终端环境变量提供本地管理员测试身份：`WIKI_TEST_EMAIL`、`WIKI_TEST_PASSWORD`，不要写入文件或版本控制。

```sh
pnpm --filter wiki test:smoke

# 同时启动成员端后，验证桌面/手机的 活动 ↔ Wiki 导航和会话复用
pnpm --filter wiki test:navigation
```

测试只允许 localhost / 127.0.0.1，会创建明确标注的 smoke 测试条目，完成后撤回公开状态，保留内部修订供检查。测试不会读取 Notion，也不会修改真实知识条目。截图输出到被 Git 忽略的 `.local/wiki-smoke/`。失败时也尝试撤回测试条目；若 API 不可用，需人工在本地工作台确认。

## 后端与迁移

- API 契约：`docs/wiki-api-contract.md`。
- 路由：`apps/api/src/routes/wiki.ts`。
- 迁移：`apps/api/migrations/0002_wiki.sql`，只新增 wiki_page / wiki_revision，不重建原表。
- 发布、撤回、保存与审计在 D1 batch 内条件写入；页版本是并发控制依据，修订正文不可变。
- 回退应用版本时保留新增表，不通过删表“回滚”；需要销毁数据前另行备份与确认。
