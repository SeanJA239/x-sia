/**
 * 「当届」口径：api-contract.md 未定义术语的具体计算方式，本实现取「当前 UTC 年份」
 * 的四位数字符串（如 "2026"），级前缀取其后两位（与 decisions.md 26001 示例一致）。
 * 这是本轮的假设，非契约明文——若与产品侧的学年划分不同（例如按开学月份切换），
 * 需要改这一处并在 admin 侧加可配置项。
 */
export function getCurrentTerm(): string {
  return String(new Date().getUTCFullYear())
}

/** 级：term 后两位，用作 member_no 前缀。 */
export function termGrade(term: string): number {
  const suffix = term.slice(-2)
  return Number.parseInt(suffix, 10)
}
