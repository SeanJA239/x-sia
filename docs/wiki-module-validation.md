# Wiki 模块联调记录

## 范围与当前状态

- 分支：`ziyu/dev-maintenance`，基线 `d0bbcf3` 后的本地未提交修改。
- 新增 `apps/wiki`，复用 Hono API、D1 和账号权限；模块契约见 `wiki-api-contract.md`。
- 本轮没有访问 Notion，没有同步真实知识，没有 Git commit/push，没有公网部署。
- 本地入口：http://localhost:8787/wiki/；`/wiki` 由网关 308 跳转。
- 本地工作台：http://localhost:8787/wiki/manage。
- 本地示例：http://localhost:8787/wiki/p/wiki-module-demo，内容为模块操作说明，不是 Notion 知识条目。
- 测试创建的 smoke 条目在验证后撤回，内部修订仍保留供检查；演示说明保留公开状态（仅本机可访问）。

## 已实现

- 极简阅读界面、动态分类、中文子串搜索、分页、章节锚点、手机布局。
- 匿名公开正文服务端渲染；禁用 JavaScript 仍可读取正文。
- 编辑者登录、工作台、新建、Markdown 编辑与安全预览、Markdown/TXT 手动导入、正文下载。
- 不可变修订、草稿/公开快照分离、发布/撤回、历史预览与恢复为新草稿。
- 服务端权限、组织隔离、乐观并发控制、条件审计、输入和请求体限制。
- 条件写入及审计在 D1 batch 中完成；失败的并发请求不会多留修订或审计。
- 数据库迁移 `0002_wiki.sql` 已在本地应用；只新增两张 Wiki 表和索引，没有重建现有业务表、没有重复执行 seed。

## 验证结果

| 检查 | 实际结果 |
| --- | --- |
| API TypeScript | 通过 |
| Wiki TypeScript + 路由类型生成 | 通过 |
| 原成员端 TypeScript | 通过 |
| 官网 TypeScript + 路由类型生成 | 通过 |
| Wiki 客户端及 SSR 生产构建 | 通过；产物为 Node SSR，未部署 |
| API 测试 `vitest run --maxWorkers=2` | 9 个文件、51 项通过，含新增 Wiki 7 项 |
| Wiki 浏览器 smoke | 通过，成功运行两次 |
| 原成员端浏览器回归 | 清理 Metro 缓存并限制 worker 后通过：登录 200、首页和会员卡深链正常，无未处理 pageerror |
| 变更范围 Biome | 25 个文件通过（含新迁移元数据） |
| `git diff --check` | 通过；Git 提示 Windows 行尾转换，不是 whitespace 检查失败 |
| 最终 HTTP 探测 | Wiki 首页跟随跳转 200、演示条目 200、成员端首页 200 |

Wiki 浏览器验证覆盖：

1. 管理员登录，经文件选择器导入 Markdown，手动保存草稿。
2. 发布前匿名访问 404，发布后无需重新构建即可读取。
3. HTTP HTML 中包含正文，禁用 JS 的匿名浏览器可读取。
4. 原始 HTML/脚本和 javascript: 链接不会执行。
5. 已发布条目保存新草稿后，公众正文和搜索仍只显示发布版本。
6. 第二个旧编辑窗口收到 409，当前输入保持，不静默覆盖。
7. 从历史 r1 载入、保存为新修订并重新发布。
8. 手机视口搜索可用，首页没有横向溢出。
9. 撤回后公开 API 和 SSR 条目均返回 404。

截图：`.local/wiki-smoke/editor-desktop.png`、`article-mobile.png`、`search-mobile.png`。图片读取工具在当前会话不可用；已做浏览器行为与尺寸检查，不声称逐像素人工审图或全浏览器视觉验收。

## 遇到的问题及处理

- 初始化测试时缺少 org：修正新增测试准备顺序，未修改生产鉴权逻辑。
- React Router 8 metadata 使用 loaderData；按实际类型修正。Vite base 与 basename 统一 `/wiki/`，网关补 `/wiki` 重定向。
- 登录页 SSR 到客户端接管期间：在 hydration 完成前禁用表单，避免输入/提交抢在事件绑定前发生。
- pnpm 安装期间发生并行链接冲突：改为单次顺序安装完成。lockfile 存在 optional peer `supports-color` 的连带解析变化，没有修改旧应用的依赖声明版本。
- 默认并行 Vitest 曾出现 Windows Worker `EINVAL`：将本次验证并发设为 2，最终 51 项全部通过。
- 已运行 Metro 保留旧依赖链接，出现找不到模块；重启过程中亦出现内存/重复监听问题。确认并停止本次旧进程，清理缓存、限制 Metro `--max-workers 2`，复测成员端通过。本地后台托管及日志放在 `.local/`，不纳入产品逻辑。

## 未通过/未覆盖边界

- 全仓 `pnpm check` 尚未通过：现有未修改文件有大量 CRLF 格式诊断及 Biome schema/CLI 版本提示；本轮不批量重排旧代码。新增/修改的 Wiki 代码及关联文件单独检查通过。
- 未做 Cloudflare 生产 SSR 适配、真实域名、线上迁移、性能/容量测试、完整备份恢复、外网安全验收。
- 不含 R2 图片或 PDF 附件、ZIP 批量导入、Notion 导入、实时协同、Slug 改名、复杂分类管理、FTS。
- 后续整理 Notion 文档前，先让用户确认模块使用体验；导入内容先草稿，发布另行确认。

## 平台同级导航增补

- 成员端 `AppNavBar` 新增 Wiki，与首页、活动、卡片、资源、我的平级，桌面顶部和手机底部均显示。
- 保留 `/activities` 活动功能，Wiki 仍使用 `/wiki/`，没有占用或替换活动路由。
- Wiki 自身也提供相同顺序的平台导航，编辑/公开页面均可返回活动；手机为固定底部导航，并预留内容空间。
- Web Wiki 链接使用原生 `<a>` 整页跳转，不经过 Expo Router 的客户端匹配。账号继续同域复用。
- 修改前读取 Expo SDK 57 概览及 Router Link 官方版本文档；未升级 Expo 依赖。
- 原生端仅在配置 `EXPO_PUBLIC_WIKI_URL` 时显示外部 Wiki 入口；本轮未做原生设备验收。
- 新增 `pnpm --filter wiki test:navigation`：1440px 与 390px 视口的活动 ↔ Wiki、六个同级入口、Wiki 当前项标记和共享登录均通过，无未处理浏览器异常或横向溢出。
- 本次修改范围 Biome 8 个文件通过，app/wiki 类型检查和 Wiki 生产构建通过，Wiki 完整 smoke 再次通过。
- 导航截图存于 `.local/wiki-navigation/`，无 Notion 数据导入，无 commit/push。

## 使用与复现

见 `apps/wiki/README.md`。测试身份只从运行环境读取，不在本记录中复制密码或 token。
