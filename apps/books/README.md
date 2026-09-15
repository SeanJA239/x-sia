# 工程基础丛书

> **当前 v0.5：Linux 七篇十四章，并纳入 AI Infra 选编，阅读原生在 Wiki。** 主入口 `/wiki/`，语言模块 `/wiki/learn/languages`，路线与参考 `/wiki/paths`。当前六个模块、36 章、约 8.5 万汉字、66 幅正文图（39 幅本工程原创、3 幅 MIT 许可的 Rust 原图、24 幅 Apache-2.0 许可的 AI Infra 原图）。本目录作为统一源稿和可选离线导出工具。
>
> 选编覆盖原著五章中的 16 个小节，其中一个只取前半；十二章归类表在 `/wiki/paths#ai-infra-map`。没有把未整理的原著章节计入正文，没有运行上游实验。
>
> 下文首版统计记录 v0.1 的历史范围；最新逐章统计以构建报告和 Wiki 学习路线页为准。旧 PDF 在源或依赖更新后不再视为最新版，应重新导出。新增源码目录如遇 Vite 缓存问题，需重启 Wiki 开发服务。

五卷基础篇的电子书工程：Markdown 正文、LaTeX 数学、可编辑 SVG 技术图、静态 HTML 阅读器与分卷 PDF 导出。

当前是 **0.5 编辑草案**，不是完整本科教材的终版。Notion 仅提供早期选题框架；基础稿自编，AI Infra 标记区块按原著许可选编并补充承接说明。不运行或嵌入私人 Notion 页面。

## 当前内容

| 卷 | 四章正文 |
|---|---|
| Linux 基础 | 进程与系统调用；文件与权限；Shell 数据流；观察与自动化 |
| 服务器基础 | 网络与 SSH；服务与 HTTP；持久化与恢复；容量与隔离 |
| 嵌入式基础 | 电气与 GPIO；工具链与启动；定时器与中断；通信与调试 |
| 计算机系统 | 位表示与 ISA；编译链接与 ABI；虚拟内存与缓存；并发与性能 |
| 数学工具 | 投影与最小二乘；微积分与数值稳定；概率与估计；信号与反馈 |

初稿统计：20 章，26,829 个汉字，20 幅技术图，另有原创 SVG 概念封面。公式统计包含行内符号与行间公式，不应把 264 个数学节点说成 264 条独立定理。每章包含目标、先修、机制、例题、练习、解题提示及参考资料。

## 启动和构建

在仓库根目录：

```sh
pnpm install
pnpm books:build
pnpm books:test
pnpm dev:books
```

- 独立预览：`http://localhost:8083/books/`
- 已启动网关时：`http://localhost:8787/books/`
- 主阅读入口：`http://localhost:8787/wiki/`，首页直接展示教材内容，开发和生产构建均使用 Wiki 原生路由。
- 分卷 PDF 下载页：`http://localhost:8787/books/downloads.html`

预览服务仅监听回环地址。`dev` 会重新构建，并监视正文、目录、样式和阅读器脚本；更改构建器或绘图脚本后需要重新构建或重启。保存源文件后刷新浏览器即可看到新输出，不依赖外部 CMS。

Wiki 已原生打包教材正文、插图和公式，正常阅读不需要独立书站。**教材正文仍在 Markdown 编辑，尚未接入 Wiki 网页编辑工作台**。没有导入、发布或覆盖 D1 中的社区条目。独立书站仅作为可选离线导出预览。

## PDF 与离线阅读

```sh
pnpm books:pdf
# 已安装的 Edge 为默认浏览器；也可指定已安装的 Chrome：
BOOKS_BROWSER_CHANNEL=chrome pnpm books:pdf
```

PDF 导出启动自己的临时回环服务，无需先启动 8083。文件位于 `apps/books/dist/exports/`，每卷一份；`manifest.json` 记录源文件身份、文件大小和 SHA256。

下载页只列出与当前正文、绘图、排版源、依赖锁一致且文件校验通过的 PDF。源文件更改后需重新导出，不把旧 PDF 标为最新版。浏览器 PDF 输出带书签和标签，但仍需逐页出版审校；页码由浏览器与字体决定。

复制整个 `dist/` 文件夹后，可以直接打开 `index.html` 离线阅读，公式与字体不需要 CDN。`file://` 下浏览器可能拒绝 fetch 检索索引；此时用页内查找，或启动本地 HTTP 服务。正文、目录和跨章链接不需要 JavaScript。

目前没有实现 EPUB、网页富文本编辑、多人协作或公开生产发布。

## 工程结构

```text
apps/books/
├── catalog.json                # 五卷书目与章节顺序
├── content/<volume>/<id>.md     # 正文唯一编辑源
├── assets/
│   ├── book.css                # 阅读、移动端与打印样式
│   ├── reader.js               # 检索、主题和移动目录
│   ├── cover.svg               # 脚本生成的原创概念封面
│   └── figures/*.svg           # 脚本生成的 20 幅技术图
├── scripts/
│   ├── build.mjs               # Markdown → HTML；校验章节和数学
│   ├── figures.mjs             # 技术图可编辑源与函数绘图
│   ├── serve.mjs               # 只读、回环、仅开放构建产物
│   ├── export-pdf.mjs          # 分卷 PDF 与源身份检查
│   ├── books.test.mjs          # 结构、安全、链接和确定性算例
│   └── browser-test.mjs        # 阅读体验与 SVG 文字边界检查
└── dist/                       # 忽略的构建输出，不编辑
```

## 添加或修改一章

1. 在 `catalog.json` 的相应卷中登记稳定 id、标题和摘要。
2. 编辑 `content/<volume>/<id>.md`，一级标题须与书目一致。
3. 使用二级标题组织问题；章标题由阅读器输出，整卷版会把小节降为三级标题。
4. 行内数学使用 `$...$`，行间数学使用独立行的 `$$`。给出符号、单位和适用条件。
5. 插图使用 `![描述图中关系的替代文本](asset:figure-id)`；在 `figures.mjs` 中维护相应 SVG。不要只写“图 1”。
6. 跨章链接使用 `[文字](book:math/linear)`，构建器检查目标存在。整卷版中同卷链接跳至卷内章节。
7. 外部参考使用 HTTPS；不允许远程图片、原始 HTML、JS、MDX 或危险链接协议。
8. 运行构建、单元测试与浏览器测试，审读公式、例题与插图后再导出 PDF。

SVG 输出会被绘图脚本重建，不直接修改生成的 SVG 作为永久修订。图片包括原创结构、时序与公式示意，以及三幅 Rust 官方教材原图；不是硬件或实验测量截图。原图来源和许可存于 `assets/third-party/rust/`，内容通过 SHA256 核对，不自动从网络下载。点击正文技术图可在独立页面查看原尺寸。

## 验证与边界

```sh
pnpm --filter books test:browser
```

浏览器测试默认使用 `localhost:8787`，可通过 `BOOKS_TEST_ORIGIN=http://localhost:8083` 改为独立预览；非回环地址被拒绝。检查 1440/390 两种视口、全部 36 章、全文搜索、主题、目录、打印样式、离线无 JS 阅读及 SVG 文字是否越界。

默认书籍构建与阅读测试不执行章节代码，不改 SSH、防火墙、服务或硬件。独立的 Linux 示例测试仅提取明确标记的 11 个自编示例，在自己创建的临时目录运行，结束后清理；不访问私有日志，不测试 OOM、磁盘填满或陌生进程。本轮对部分确定性答案使用独立断言核对，不代表完整数学证明审查。真实 Linux 操作、目标板行为、参考资料逐条审校与 PDF 逐页视觉检查应另行完成。

浏览器截图保存在 `.local/books-preview/`。图像读取工具本轮不可用，因此只有截图生成与布局/行为断言，未声称完成像素级视觉审阅。

### Linux 深化稿示例回归

```sh
# Bash 5、GNU coreutils 和 Python 3 均需已安装；不自动安装。
pnpm --filter books test:linux-examples
pnpm --filter books exec node scripts/linux-figures-test.mjs

# Windows：在已经确认的 Git Bash 终端中明确传入该 Bash。
BOOKS_BASH="$(cygpath -w /usr/bin/bash)" pnpm --filter books test:linux-examples
```

可通过 `BOOKS_PYTHON` 指定已审阅的 Python 路径。不要把 Windows 的 WSL 启动器与 Git Bash 路径混用。示例测试覆盖参数、状态、格式反例、描述符偏移、拒绝覆盖与并发竞争；Linux 专属 unlink 测试在非 Linux 平台明确跳过。新图测试仅检查文本边界并输出截图，不代替逐图视觉审校。

v0.3 历史范围见 `docs/wiki-textbook-validation-v0.3.md`；最新分篇及 AI Infra 选编见 `docs/wiki-linux-system-restructure.md`、`docs/ai-infra-integration.md`。未重新导出旧版 PDF；Wiki 内整卷打印使用当前正文。

### AI Infra 选编的来源与检查

固定上游版本为 `58636943ba89f24b854f04f0f8f2fffe7b323829`。原图、完整许可、选编位置与 SHA256 在 `assets/third-party/ai-infra/`。`scripts/import-ai-infra.mjs` 是手动整理工具，读取已校验的 `.local/ai-infra-reference/` 原稿快照；缺少快照会失败，不在普通构建中下载或自动同步上游。图已归档且身份匹配时可复用，不执行上游脚本。

```sh
pnpm --filter books exec node --test scripts/ai-infra.test.mjs
pnpm --filter books test:systems-examples
pnpm --filter wiki exec node --experimental-strip-types --test scripts/headings.test.mjs
```

选编使用标记区块保持幂等，使用回调插入以保留 Markdown 双美元公式分隔符。脚注定义从完整上游原稿收集，重编号避免整卷冲突；原文相对参考改为固定版本的 GitHub 链接。完整许可不计为新增汉字体量，屏幕上可滚动阅读，打印不裁剪。

更多编辑原则见 `docs/engineering-books-plan.md`，本轮交付检查见 `docs/engineering-books-validation.md`。私人来源映射仅存 `.local/engineering-books-sources.md`。

## 后续深化方向

本版给出连续基础路径；后续应逐章扩展，而非只增加目录：

- Linux：包管理、启动链、文件系统实现与系统调用跟踪。
- 服务器：TLS 证书运维、数据库部署、备份演练和受控发布。
- 嵌入式：完整板级参考工程、驱动分层、DMA 缓冲和 RTOS。
- 系统：可执行 ISA 模型、流水线案例、内存模型与性能分析。
- 数学：完整 QR/SVD 计算、Laplace/Z 变换、控制设计与状态估计。

这些是后续范围，不计入本版已完成内容。参考链接不意味着复制外部教材的授权；封面与原创图为本工程重新绘制，三幅官方原图另按 MIT 许可转载，发行许可证和署名仍需明确后再公开发行。
