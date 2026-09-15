import { Link } from 'react-router'

export function Pager({
  page,
  total,
  pageSize,
  href,
}: {
  page: number
  total: number
  pageSize: number
  href: (page: number) => string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav className="pager" aria-label="分页">
      {page > 1 && <Link to={href(page - 1)}>← 上一页</Link>}
      <span>
        第 {page} / {pages} 页 · 共 {total} 项
      </span>
      {page < pages && <Link to={href(page + 1)}>下一页 →</Link>}
    </nav>
  )
}
