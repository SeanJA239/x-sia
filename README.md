# X-SIA

社团自有的身份 + 内容 + 权益平台。

## 结构

- `apps/api` — Hono API（Cloudflare Workers + D1 + R2 + Workers AI）
- `apps/app` — 成员端应用（Expo，web 优先）+ admin 后台
- `apps/site` — 门面站（fumadocs）
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
