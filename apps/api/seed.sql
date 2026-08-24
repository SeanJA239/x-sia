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
