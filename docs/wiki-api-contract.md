# Wiki API 契约 — 模块联调 v1

本轮仅调通独立 Wiki 前端与现有 Hono 后端，不读取 Notion、不自动发布外部内容、不部署公网。

## 边界

- Base：`/api/v1/wiki`；页面入口 `/wiki`，同域复用现有 Bearer session。
- 公开阅读使用 SSR，正文来自 D1 已发布快照；保存/发布无需重新构建。
- 独立 `apps/wiki`：React Router + React，Markdown 编辑及安全预览，不执行 MDX 或原始 HTML。
- 首版支持 Markdown / TXT 浏览器本地导入编辑器，再明确保存为草稿。不上传 PDF、图片，不做 Notion 同步、重命名或公开协作。
- 现有 `admin` 或 `wiki_admin`：编辑及发布；`wiki_editor`：编辑草稿、查看内部历史，无发布/撤回权限。均只认未撤销、未过期的 entitlement，普通 active 成员不自动获得编辑权。
- 分类首版为修订上的单一文本分类，目录动态聚合已发布内容；不引入分类管理表。
- 搜索首版为已发布标题、摘要及正文的参数化 LIKE 查询，支持中文子串；不宣称已实现 FTS/语义搜索。

## 页面与修订

`wiki_page`：id, org_id, slug, draft_revision_id, published_revision_id, version, last_mutation_id, created_at, updated_at, published_at。

`wiki_revision`：id, org_id, page_id, number, title, summary, category, body_md, change_note, author_id, created_at。

- Slug 为 1–100 字符小写英文/数字/单连字符，创建后本轮不允许修改。
- 标题 1–160 字符；摘要 ≤300；分类 1–60；修改说明 1–300；正文 1–100000。
- 每次保存创建不可变修订。公众只读 published_revision_id；草稿修改不改变公开标题、分类、搜索结果或正文。
- 所有修改携带 `expected_version`。保存、发布、撤回均原子递增 page.version；旧版本请求返回 409 `version_conflict`，不新增修订或审计。
- D1 batch 中执行条件写入和审计；last_mutation_id 用于限定审计只对应成功的本次操作。
- 恢复历史：编辑器载入历史正文，保存为新修订，再由管理员发布；不覆盖或删除旧版本。
- 公开 API 与 SSR 暂用 Cache-Control: no-store，保证撤回与更新立即可见；后续缓存必须有失效机制。
- 请求体上限 512 KiB，参数非法 400；鉴权沿用 401/403；不可见页面与不存在同为 404。

## 路由

| 方法 | 路径 | 响应/说明 |
| --- | --- | --- |
| GET | `/pages?q=&category=&page=` | 公开列表 `{items, categories, total, page, page_size:30}`，只查发布快照 |
| GET | `/pages/:slug` | 公开 `{id,slug,title,summary,category,body_md,revision_number,published_at}` |
| GET | `/access` | 登录后 `{can_edit,can_publish}` |
| GET | `/manage/pages?page=` | 编辑权限，分页工作台 `{items,total,page,page_size:30}` |
| POST | `/manage/pages` | 编辑权限，`{slug,title,summary,category,body_md,change_note}` → 201 `{id,version:1}` |
| GET | `/manage/pages/:id` | 编辑权限，`{id,slug,version,published_revision_id,published_at,draft}`，draft 为完整修订 |
| PUT | `/manage/pages/:id` | 编辑权限，`{expected_version,title,summary,category,body_md,change_note}` → `{id,version}` |
| GET | `/manage/pages/:id/revisions?page=` | 编辑权限，仅历史元数据分页 `{items,total,page,page_size:30}`，不开放给公众，避免未发布修订泄露 |
| GET | `/manage/pages/:id/revisions/:rid` | 编辑权限，返回完整历史修订供查看和恢复 |
| POST | `/manage/pages/:id/publish` | 发布权限，`{expected_version}` → `{id,version}`；发布当前已保存草稿 |
| POST | `/manage/pages/:id/unpublish` | 发布权限，同上，撤回后公众读到 404，搜索不再出现 |

统一错误沿用 `{error:{code,message}}`。重复 Slug 为 409 `slug_taken`。

## 首轮验收

1. 匿名看不到草稿、管理接口和修订历史。
2. 普通成员不可创建/修改；编辑者可存草稿但不能发布；过期/撤权后立即失效。
3. 新建 → 保存 → 发布 → 无登录阅读与搜索 → 草稿修改不泄露 → 再发布 → 历史恢复 → 撤回。
4. 并发保存只有一方成功，另一方 409，失败方不产生修订或审计。
5. Markdown 导入经过用户主动保存；脚本、原始 HTML 和危险链接不可执行。
6. `/wiki` 和条目深链 SSR 可读，手机可操作，现有成员平台/API 继续可用。
