-- 本地开发种子数据。跑 `pnpm --filter api seed`（需先 `pnpm --filter api migrate:local`）。
--
-- 密码 hash 用运行时同款算法生成（见 scripts/generate-seed-hashes.ts），格式
-- `iterations:salt:hash`（PBKDF2-SHA256，120000 次迭代）：
--   admin@x-sia.test  明文 admin1234
--   member@x-sia.test 明文 member1234
--   applied@x-sia.test 明文 applied1234（applied 状态，未核验未缴费）

INSERT INTO org (id, slug, name, email_domains, created_at) VALUES
  ('org_xsia', 'x-sia', 'X-SIA', '[]', '2026-08-24T00:00:00.000Z');

INSERT INTO user (id, email, password_hash, display_name, avatar, email_verified_at, verified_by, created_at) VALUES
  ('user_admin', 'admin@x-sia.test', '120000:d78a3915e2db3abb236ab26ad85f9a64:3afcfc14e91150e23f451408e08c7b568d16b31a51a223b9be7f5b9bee8d7d57', '干事·管理员', NULL, '2026-08-24T00:00:00.000Z', 'manual', '2026-08-24T00:00:00.000Z'),
  ('user_member', 'member@x-sia.test', '120000:ab4dfa782874da84e6549473e0a9612a:0f99b0addf70a522c926dc8596c350bab61b2645c6afe94185a9f8355f62df05', '普通社员', NULL, '2026-08-24T00:00:00.000Z', 'manual', '2026-08-24T00:00:00.000Z'),
  ('user_applied', 'applied@x-sia.test', '120000:9a18d716bb240a9f0de29cc06ba6b775:5ca9b605f0923fc3ed0fd5018a538ae08c959c46104e0ecc41974472f308ffce', '待核验用户', NULL, NULL, NULL, '2026-08-24T00:00:00.000Z');

-- term "2026" -> 级 26，member_no = 26*1000 + 顺序号。
INSERT INTO membership (id, org_id, user_id, term, status, member_no, paid_confirmed_at, paid_confirmed_by, in_group_at, in_group_by, created_at) VALUES
  ('mem_admin_2026', 'org_xsia', 'user_admin', '2026', 'active', 26001, '2026-08-24T00:00:00.000Z', 'user_admin', '2026-08-24T00:00:00.000Z', 'user_admin', '2026-08-24T00:00:00.000Z'),
  ('mem_member_2026', 'org_xsia', 'user_member', '2026', 'active', 26002, '2026-08-24T00:00:00.000Z', 'user_admin', '2026-08-24T00:00:00.000Z', 'user_admin', '2026-08-24T00:00:00.000Z'),
  ('mem_applied_2026', 'org_xsia', 'user_applied', '2026', 'applied', NULL, NULL, NULL, NULL, NULL, '2026-08-24T00:00:00.000Z');

INSERT INTO entitlement (id, org_id, user_id, kind, tier, granted_at, expires_at, revoked_at) VALUES
  ('ent_admin_role', 'org_xsia', 'user_admin', 'admin', NULL, '2026-08-24T00:00:00.000Z', NULL, NULL);

-- 阶段三：活动与签到。event_ongoing 的起止时间故意跨度很大（2020~2030），
-- 保证不管本地什么时候跑这份 seed，「进行中活动」这条都始终成立，不用每次改日期。
INSERT INTO event (id, org_id, title, starts_at, ends_at, location, checkin_secret, luma_id, created_at) VALUES
  ('event_ongoing', 'org_xsia', '本地测试·进行中活动', '2020-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z', '活动室', 'seed-ongoing-checkin-secret-do-not-use-in-prod', NULL, '2026-08-24T00:00:00.000Z'),
  ('event_future', 'org_xsia', '未来活动示例', '2030-06-01T10:00:00.000Z', '2030-06-01T12:00:00.000Z', '大礼堂', 'seed-future-checkin-secret-do-not-use-in-prod', NULL, '2026-08-24T00:00:00.000Z');

-- 阶段三：论坛 / 墙。member 作为作者，article 带 2 条评论。
INSERT INTO post (id, org_id, author_id, kind, title, body_md, status, created_at) VALUES
  ('post_wall_1', 'org_xsia', 'user_member', 'wall', '第一条墙贴', '大家好，这是墙上的第一条动态，欢迎交流～', 'published', '2026-08-24T00:00:00.000Z'),
  ('post_wall_2', 'org_xsia', 'user_member', 'wall', '第二条墙贴', '继续冒泡，有活动记得来签到。', 'published', '2026-08-24T00:00:00.000Z'),
  ('post_article_1', 'org_xsia', 'user_member', 'article', '一篇示例文章', '# 标题

这是一篇用于本地测试的示例文章正文，内容随便写一些，凑够长度用于测试摘要截取逻辑是否正常工作。', 'published', '2026-08-24T00:00:00.000Z');

INSERT INTO comment (id, org_id, post_id, author_id, body, created_at) VALUES
  ('comment_1', 'org_xsia', 'post_article_1', 'user_admin', '写得不错！', '2026-08-24T00:00:01.000Z'),
  ('comment_2', 'org_xsia', 'post_article_1', 'user_member', '谢谢支持～', '2026-08-24T00:00:02.000Z');

-- 阶段三：title 与 cert。给 member 授予一个称号并设为佩戴；签发一张挂在进行中活动上的 cert。
INSERT INTO title_def (id, org_id, name, rule_json) VALUES
  ('title_founder', 'org_xsia', '创社成员', NULL),
  ('title_active', 'org_xsia', '活跃分子', NULL);

INSERT INTO user_title (id, org_id, user_id, title_def_id, granted_at) VALUES
  ('user_title_member_founder', 'org_xsia', 'user_member', 'title_founder', '2026-08-24T00:00:00.000Z');

UPDATE user SET worn_user_title_id = 'user_title_member_founder' WHERE id = 'user_member';

INSERT INTO certificate (id, org_id, user_id, event_id, serial, issued_at) VALUES
  ('cert_member_1', 'org_xsia', 'user_member', 'event_ongoing', 'XSIA-2026-SEED1', '2026-08-24T00:00:00.000Z');
