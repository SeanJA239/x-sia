import { useEffect, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { Markdown } from '../components/Markdown'
import {
  type Access,
  ApiError,
  api,
  type DraftPage,
  message,
  type Paged,
  type Revision,
} from '../lib/api'

export const meta = () => [
  { title: '编辑条目 — X-SIA Wiki' },
  { name: 'robots', content: 'noindex' },
]
const blank = {
  slug: '',
  title: '',
  summary: '',
  category: '未分类',
  body_md: '',
  change_note: '初始版本',
}
type FormData = typeof blank
const revisionFields = (r: Revision, slug: string): FormData => ({
  slug,
  title: r.title,
  summary: r.summary,
  category: r.category,
  body_md: r.body_md,
  change_note: r.change_note,
})

export default function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rights, setRights] = useState<Access | null>(null)
  const [page, setPage] = useState<DraftPage | null>(null)
  const [form, setForm] = useState<FormData>(blank)
  const [baseline, setBaseline] = useState(JSON.stringify(blank))
  const [history, setHistory] = useState<Paged<Revision> | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [historic, setHistoric] = useState<Revision | null>(null)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(form) !== baseline
  const blocker = useBlocker(dirty && !busy)
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    let live = true
    setReady(false)
    setError('')
    setNotice('')
    setHistoric(null)
    setHistory(null)
    setHistoryPage(1)
    ;(async () => {
      try {
        const access = await api<Access>('/wiki/access', { auth: true })
        if (!live) return
        setRights(access)
        if (!access.can_edit) {
          setReady(true)
          return
        }
        const current = id ? await api<DraftPage>(`/wiki/manage/pages/${id}`, { auth: true }) : null
        if (!live) return
        const values = current ? revisionFields(current.draft, current.slug) : { ...blank }
        setPage(current)
        setForm(values)
        setBaseline(JSON.stringify(values))
        setReady(true)
      } catch (e) {
        if (!live) return
        if (e instanceof ApiError && e.status === 401)
          navigate(`/login?next=${encodeURIComponent(id ? `/edit/${id}` : '/new')}`, {
            replace: true,
          })
        else setError(message(e))
      }
    })()
    return () => {
      live = false
    }
  }, [id, navigate])
  useEffect(() => {
    if (!id || !page || !rights?.can_edit) return
    let live = true
    api<Paged<Revision>>(`/wiki/manage/pages/${id}/revisions?page=${historyPage}`, { auth: true })
      .then((result) => {
        if (live) setHistory(result)
      })
      .catch((e) => {
        if (live) setError(message(e))
      })
    return () => {
      live = false
    }
  }, [id, page, rights, historyPage])

  function update(key: keyof FormData, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  function downloadBackup() {
    const url = URL.createObjectURL(
      new Blob([form.body_md], { type: 'text/markdown;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${form.slug || 'wiki-draft'}.md`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function save() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (!id) {
        const created = await api<{ id: string }>('/wiki/manage/pages', {
          method: 'POST',
          auth: true,
          body: form,
        })
        setBaseline(JSON.stringify(form))
        navigate(`/edit/${created.id}`, { replace: true })
      } else if (page) {
        const result = await api<{ version: number }>(`/wiki/manage/pages/${id}`, {
          method: 'PUT',
          auth: true,
          body: { ...form, expected_version: page.version },
        })
        // Read back after a confirmed write; on read failure, leave text intact and advise refresh.
        setPage({ ...page, version: result.version })
        const current = await api<DraftPage>(`/wiki/manage/pages/${id}`, { auth: true })
        const values = revisionFields(current.draft, current.slug)
        setPage(current)
        setForm(values)
        setBaseline(JSON.stringify(values))
        setHistoryPage(1)
        setNotice('草稿已保存。公众页面保持不变，发布后才会更新。')
      }
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  async function publish(action: 'publish' | 'unpublish') {
    if (!page || !id || dirty) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ version: number }>(`/wiki/manage/pages/${id}/${action}`, {
        method: 'POST',
        auth: true,
        body: { expected_version: page.version },
      })
      setPage({ ...page, version: result.version })
      setPage(await api<DraftPage>(`/wiki/manage/pages/${id}`, { auth: true }))
      setNotice(
        action === 'publish'
          ? '已发布。公众现在可以阅读此版本，无需重新部署。'
          : '已撤回公开版本。条目及历史仍保留在工作台。',
      )
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main" className="workspace editor-workspace">
      <div className="breadcrumbs">
        <Link to="/manage">编辑工作台</Link> / {id ? '编辑条目' : '新建条目'}
      </div>
      <h1>{id ? '编辑条目' : '新建 / 导入条目'}</h1>
      {error && (
        <div className="error" role="alert">
          {error}
          <p className="small">
            如果发生版本冲突或保存超时，请先下载正文备份，再刷新核对最新版本。
          </p>
        </div>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {blocker.state === 'blocked' && (
        <div className="notice" role="alert">
          <p>当前修改尚未保存，离开会丢失这些修改。</p>
          <div className="actions">
            <button type="button" onClick={() => blocker.reset()}>
              继续编辑
            </button>
            <button type="button" className="secondary" onClick={() => blocker.proceed()}>
              放弃修改并离开
            </button>
          </div>
        </div>
      )}
      {!ready && !error && <p role="status">正在读取编辑权限与草稿…</p>}
      {ready && !rights?.can_edit && (
        <p className="notice">
          当前账号没有 Wiki 编辑权限。<Link to="/">返回公开阅读</Link>
        </p>
      )}
      {ready && rights?.can_edit && (
        <>
          <p className="lead">Markdown 正文 · 保存与发布分离 · 每次保存保留历史版本</p>
          <div className="toolbar">
            <span className="status-tag">
              {!page?.published_revision_id
                ? '未公开'
                : page.published_revision_id === page.draft.id
                  ? '已发布'
                  : '已发布 · 有新草稿'}
            </span>
            <span className="muted">{dirty ? '有未保存修改' : '没有未保存修改'}</span>
            {page?.published_revision_id && <Link to={`/p/${page.slug}`}>查看公开页面 ↗</Link>}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <fieldset disabled={busy}>
              <div className="form-grid">
                <div>
                  <label htmlFor="title">标题</label>
                  <input
                    id="title"
                    required
                    maxLength={160}
                    value={form.title}
                    onChange={(e) => update('title', e.target.value)}
                    placeholder="例如：Linux 环境配置"
                  />
                </div>
                <div>
                  <label htmlFor="slug">固定地址 Slug</label>
                  <input
                    id="slug"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={100}
                    readOnly={Boolean(id)}
                    value={form.slug}
                    onChange={(e) => update('slug', e.target.value)}
                    placeholder="linux-environment"
                  />
                  <span className="hint">小写英文、数字和连字符；创建后保持不变。</span>
                </div>
                <div>
                  <label htmlFor="category">分类</label>
                  <input
                    id="category"
                    required
                    maxLength={60}
                    value={form.category}
                    onChange={(e) => update('category', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="summary">摘要</label>
                  <input
                    id="summary"
                    maxLength={300}
                    value={form.summary}
                    onChange={(e) => update('summary', e.target.value)}
                    placeholder="用一句话说明这篇条目解决什么问题"
                  />
                </div>
              </div>
              <details className="import-box">
                <summary>从本地文件导入正文</summary>
                <p>
                  支持 .md / .markdown / .txt，UTF-8，最大 400
                  KiB。导入仅填入编辑器，不会自动保存或公开。为避免覆盖，请先保存当前正文。
                </p>
                <label htmlFor="import-file">选择文档</label>
                <input
                  id="import-file"
                  type="file"
                  accept=".md,.markdown,.txt"
                  disabled={dirty && form.body_md.length > 0}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    setError('')
                    try {
                      if (!/\.(md|markdown|txt)$/i.test(file.name))
                        throw new Error('只支持 Markdown 或 TXT 文件')
                      if (file.size > 400 * 1024) throw new Error('文件不能超过 400 KiB')
                      const text = new TextDecoder('utf-8', { fatal: true })
                        .decode(await file.arrayBuffer())
                        .replace(/^\uFEFF/, '')
                      if (text.length > 100000 || !text.trim() || text.includes('\0'))
                        throw new Error('正文不能为空、包含空字符或超过 100000 字符')
                      const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim()
                      setForm((current) => ({
                        ...current,
                        body_md: text,
                        title:
                          current.title ||
                          heading?.slice(0, 160) ||
                          file.name.replace(/\.[^.]+$/, '').slice(0, 160),
                        change_note: '从本地文档导入',
                      }))
                      setNotice('文件已载入编辑器，尚未保存或发布。')
                    } catch (e) {
                      setError(message(e))
                    }
                  }}
                />
              </details>
              <div className="editor-grid">
                <div>
                  <label htmlFor="body">Markdown 正文</label>
                  <textarea
                    id="body"
                    className="body-editor"
                    required
                    maxLength={100000}
                    spellCheck={false}
                    value={form.body_md}
                    onChange={(e) => update('body_md', e.target.value)}
                    placeholder={'## 概述\n\n写下可复用的知识…'}
                  />
                  <p className="hint">
                    {form.body_md.length} / 100000 字符 · 原始 HTML 不执行，图片托管后续开放。
                  </p>
                </div>
                <section className="preview" aria-label="正文预览">
                  <h2>预览</h2>
                  {form.body_md ? (
                    <Markdown body={form.body_md} />
                  ) : (
                    <p className="muted">正文预览会显示在这里。</p>
                  )}
                </section>
              </div>
              <label htmlFor="change-note">本次修改说明</label>
              <input
                id="change-note"
                required
                maxLength={300}
                value={form.change_note}
                onChange={(e) => update('change_note', e.target.value)}
              />
              <div className="toolbar">
                <button type="submit" disabled={Boolean(id) && !dirty}>
                  {busy ? '处理中…' : '保存草稿'}
                </button>
                <button type="button" className="secondary" onClick={downloadBackup}>
                  下载正文备份
                </button>
                {rights.can_publish && page && (
                  <>
                    <button
                      type="button"
                      disabled={dirty || page.published_revision_id === page.draft.id}
                      onClick={() => void publish('publish')}
                    >
                      发布已保存草稿
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={dirty || !page.published_revision_id}
                      onClick={() => void publish('unpublish')}
                    >
                      撤回公开版本
                    </button>
                  </>
                )}
              </div>
            </fieldset>
          </form>
          {history && (
            <section className="revision-section">
              <h2>修订历史</h2>
              <p className="muted">只有编辑者可见。恢复旧内容时会创建新草稿，不删除已有历史。</p>
              <ul className="history-list">
                {history.items.map((r) => (
                  <li key={r.id}>
                    <span>
                      r{r.number} · {r.change_note}
                      <small>{r.created_at.replace('T', ' ').slice(0, 19)} UTC</small>
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          setHistoric(
                            await api<Revision>(`/wiki/manage/pages/${id}/revisions/${r.id}`, {
                              auth: true,
                            }),
                          )
                        } catch (e) {
                          setError(message(e))
                        }
                      }}
                    >
                      查看 r{r.number}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="pager">
                <button
                  type="button"
                  className="secondary"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  上一页
                </button>
                <span>{history.total} 次修订</span>
                <button
                  type="button"
                  className="secondary"
                  disabled={historyPage * history.page_size >= history.total}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  下一页
                </button>
              </div>
            </section>
          )}
          {historic && (
            <section className="history-preview">
              <h2>
                历史版本 r{historic.number}：{historic.title}
              </h2>
              <Markdown body={historic.body_md} />
              <div className="actions">
                <button
                  type="button"
                  disabled={dirty || busy}
                  onClick={() => {
                    setForm({
                      ...revisionFields(historic, form.slug),
                      change_note: `恢复历史版本 r${historic.number}`,
                    })
                    setHistoric(null)
                    setNotice('历史内容已载入编辑器。请保存为新草稿，再决定是否发布。')
                  }}
                >
                  载入为草稿
                </button>
                <button type="button" className="secondary" onClick={() => setHistoric(null)}>
                  关闭历史预览
                </button>
                {dirty && <span>请先保存当前修改，再载入历史版本。</span>}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
