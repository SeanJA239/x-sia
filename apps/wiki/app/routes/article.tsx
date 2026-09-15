import { useEffect, useState } from 'react'
import { data, Link, useLoaderData } from 'react-router'
import { Markdown } from '../components/Markdown'
import type { PublicPage } from '../lib/api'
import { publicApi } from '../lib/public.server'
import type { Route } from './+types/article'

export const headers = () => ({ 'Cache-Control': 'no-store' })
export async function loader({ params }: Route.LoaderArgs) {
  return data(await publicApi<PublicPage>(`/pages/${encodeURIComponent(params.slug)}`), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
export function meta({ loaderData: page }: Route.MetaArgs) {
  return [
    { title: page ? `${page.title} — X-SIA Wiki` : 'X-SIA Wiki' },
    { name: 'description', content: page?.summary ?? '' },
  ]
}
export default function Article() {
  const page = useLoaderData<typeof loader>()
  const [headings, setHeadings] = useState<{ id: string; text: string }[]>([])
  useEffect(() => {
    if (!page.body_md) {
      setHeadings([])
      return
    }
    setHeadings(
      Array.from(document.querySelectorAll('.markdown h2, .markdown h3')).map((el) => ({
        id: el.id,
        text: el.textContent ?? '',
      })),
    )
  }, [page.body_md])
  return (
    <div className="reading-layout">
      <aside className="sidebar">
        <p className="nav-label">导航</p>
        <Link to="/">← 所有条目</Link>
        <Link to={`/?category=${encodeURIComponent(page.category)}`}>{page.category}</Link>
        <hr />
        <Link to={`/edit/${page.id}`}>编辑此页</Link>
      </aside>
      <main id="main" className="reading-main">
        <div className="breadcrumbs">
          <Link to="/">知识手册</Link> / {page.category}
        </div>
        <h1>{page.title}</h1>
        <p className="lead">{page.summary}</p>
        <div className="meta article-meta">
          <span>修订 r{page.revision_number}</span>
          <span>发布于 {page.published_at?.slice(0, 10)}</span>
          <span>公开阅读</span>
        </div>
        <Markdown body={page.body_md} />
        <div className="article-bottom">
          <p>发现内容需要完善？有编辑权限的用户可提交新修订。</p>
          <Link to={`/edit/${page.id}`}>查看编辑与修订记录 →</Link>
        </div>
      </main>
      <aside className="right-rail">
        <p className="nav-label">本页目录</p>
        <nav aria-label="本页目录">
          {headings.map((h) => (
            <a key={h.id} href={`#${h.id}`}>
              {h.text}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  )
}
