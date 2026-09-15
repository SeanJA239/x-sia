import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Pager } from '../components/Pager'
import {
  type Access,
  ApiError,
  api,
  type ManagedPage,
  message,
  type Paged,
  TOKEN_KEY,
} from '../lib/api'

export const meta = () => [
  { title: '编辑工作台 — X-SIA Wiki' },
  { name: 'robots', content: 'noindex' },
]
export default function Manage() {
  const [access, setAccess] = useState<Access | null>(null)
  const [list, setList] = useState<Paged<ManagedPage> | null>(null)
  const [error, setError] = useState('')
  const navigate = useNavigate(),
    [params] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  useEffect(() => {
    let active = true
    setError('')
    setList(null)
    ;(async () => {
      try {
        const rights = await api<Access>('/wiki/access', { auth: true })
        if (!active) return
        setAccess(rights)
        if (rights.can_edit) {
          const rows = await api<Paged<ManagedPage>>(`/wiki/manage/pages?page=${page}`, {
            auth: true,
          })
          if (active) setList(rows)
        }
      } catch (e) {
        if (!active) return
        if (e instanceof ApiError && e.status === 401)
          navigate('/login?next=/manage', { replace: true })
        else setError(message(e))
      }
    })()
    return () => {
      active = false
    }
  }, [navigate, page])
  return (
    <main id="main" className="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EDITOR WORKSPACE</p>
          <h1>编辑工作台</h1>
        </div>
        <div className="actions">
          <Link to="/">查看公开页面</Link>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                await api('/auth/logout', { method: 'POST', auth: true })
                localStorage.removeItem(TOKEN_KEY)
                navigate('/login')
              } catch (e) {
                setError(message(e))
              }
            }}
          >
            退出登录
          </button>
        </div>
      </div>
      <p className="lead">先保存草稿，再审核发布。草稿和修订历史不会向公众开放。</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {access?.can_edit === false ? (
        <div className="notice">
          <h2>此账号没有 Wiki 编辑权限</h2>
          <p>需要 wiki_editor、wiki_admin 或现有 admin 权限。普通成员可继续公开阅读。</p>
        </div>
      ) : (
        <>
          {access?.can_edit && (
            <div className="toolbar">
              <Link className="button" to="/new">
                新建 / 导入条目
              </Link>
              <span className="muted">
                {access.can_publish ? '权限：编辑与发布' : '权限：仅编辑草稿'}
              </span>
            </div>
          )}
          {!list && !error && <p role="status">正在读取工作台…</p>}
          {list?.items.length === 0 && (
            <div className="empty">
              <h2>还没有条目</h2>
              <p>新建文章，或上传 Markdown 文件开始。</p>
            </div>
          )}
          {list && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>条目</th>
                      <th>分类</th>
                      <th>状态</th>
                      <th>更新</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link to={`/edit/${item.id}`}>{item.title}</Link>
                          <div className="muted small">{item.slug}</div>
                        </td>
                        <td>{item.category}</td>
                        <td>
                          {!item.published_revision_id
                            ? '未公开'
                            : item.draft_revision_id === item.published_revision_id
                              ? '已发布'
                              : '已发布 · 有新草稿'}
                        </td>
                        <td>{item.updated_at.slice(0, 10)}</td>
                        <td>
                          <Link to={`/edit/${item.id}`}>编辑</Link>
                          {item.published_revision_id && (
                            <>
                              {' '}
                              · <Link to={`/p/${item.slug}`}>阅读</Link>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={list.page}
                total={list.total}
                pageSize={list.page_size}
                href={(p) => `/manage?page=${p}`}
              />
            </>
          )}
        </>
      )}
    </main>
  )
}
