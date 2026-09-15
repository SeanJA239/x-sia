import { data, Form, Link, useLoaderData, useNavigation, useSearchParams } from 'react-router'
import { CurriculumIndex } from '../components/CurriculumIndex'
import { Pager } from '../components/Pager'
import type { PageList } from '../lib/api'
import { chapterPath, curriculum } from '../lib/curriculum'
import { searchCurriculum } from '../lib/curriculum.server'
import { publicApi } from '../lib/public.server'
import type { Route } from './+types/home'

export const meta = () => [
  { title: 'X-SIA Wiki — 工程知识体系' },
  {
    name: 'description',
    content: 'Linux、服务器、嵌入式、计算机系统、数学与编程语言的系统教程和学习路线。',
  },
]
export const headers = () => ({ 'Cache-Control': 'no-store' })
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const query = new URLSearchParams()
  for (const key of ['q', 'category', 'page'])
    if (url.searchParams.has(key)) query.set(key, url.searchParams.get(key) ?? '')
  let community: PageList = { items: [], categories: [], total: 0, page: 1, page_size: 20 }
  let apiUnavailable = false
  try {
    community = await publicApi<PageList>(`/pages?${query}`)
  } catch (error) {
    if (error instanceof Response && error.status < 500) throw error
    apiUnavailable = true
  }
  return data(
    {
      community,
      apiUnavailable,
      textbookResults: searchCurriculum(query.get('q') ?? '', query.get('category') ?? ''),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
export default function Home() {
  const { community: result, apiUnavailable, textbookResults } = useLoaderData<typeof loader>()
  const [params] = useSearchParams()
  const navigation = useNavigation()
  const filtered = Boolean(params.get('q') || params.get('category'))
  const topicNames = new Set(curriculum.volumes.map((volume) => volume.title))
  const pageHref = (page: number) => {
    const q = new URLSearchParams(params)
    q.set('page', String(page))
    return `/?${q}`
  }
  return (
    <div className="reading-layout">
      <aside className="sidebar" aria-label="分类导航">
        <p className="nav-label">知识体系</p>
        <Link to="/" aria-current={!filtered ? 'page' : undefined}>
          全部内容
        </Link>
        {curriculum.volumes.map((volume) => (
          <Link
            key={volume.id}
            to={`/?category=${encodeURIComponent(volume.title)}`}
            aria-current={params.get('category') === volume.title ? 'page' : undefined}
          >
            {volume.title}
            <span>{volume.chapters.length} 章</span>
          </Link>
        ))}
        {result.categories
          .filter((item) => !topicNames.has(item.category))
          .map((item) => (
            <Link
              key={item.category}
              to={`/?category=${encodeURIComponent(item.category)}`}
              aria-current={params.get('category') === item.category ? 'page' : undefined}
            >
              {item.category}
              <span>{item.count}</span>
            </Link>
          ))}
        <hr />
        <p className="muted small">
          系统教材与社区条目在同一 Wiki 内阅读。社区搜索只展示已发布修订。
        </p>
      </aside>
      <main id="main" className="reading-main">
        <p className="eyebrow">X-SIA / KNOWLEDGE SYSTEMS</p>
        <h1>工程知识体系</h1>
        <p className="lead">
          Linux、服务器、嵌入式、计算机系统、数学与编程语言。从零基础逐步走向机制与工程实践。
        </p>
        <Form method="get" className="search-form" role="search">
          <label className="sr-only" htmlFor="search">
            搜索知识库
          </label>
          <input
            id="search"
            key={params.get('q')}
            name="q"
            defaultValue={params.get('q') ?? ''}
            placeholder="搜索所有教材与已发布条目…"
            maxLength={100}
          />
          {params.get('category') && (
            <input type="hidden" name="category" value={params.get('category') ?? ''} />
          )}
          <button type="submit">搜索</button>
        </Form>
        {!filtered ? (
          <CurriculumIndex />
        ) : (
          <section aria-label="教材搜索结果">
            <div className="section-heading">
              <h2>{params.get('q') ? `搜索：${params.get('q')}` : params.get('category')}</h2>
              <span className="muted small">
                {navigation.state !== 'idle' ? '正在查询…' : `${textbookResults.length} 章教材`}
              </span>
            </div>
            {textbookResults.length ? (
              <ul className="entry-list textbook-results">
                {textbookResults.map((chapter) => (
                  <li key={chapter.key}>
                    <Link className="entry-title" to={chapterPath(chapter.volumeId, chapter.id)}>
                      {chapter.title}
                    </Link>
                    <p>{chapter.excerpt}</p>
                    <span className="muted small">
                      {chapter.volumeTitle} · 第 {chapter.number} 章 · 基础篇编辑稿
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">没有匹配的教材章节。</p>
            )}
          </section>
        )}
        <section className="community-section" aria-label="社区知识条目">
          <div className="section-heading">
            <h2>{filtered ? '匹配的社区条目' : '社区知识条目'}</h2>
            <span className="muted small">
              {apiUnavailable ? '暂不可用' : `${result.total} 篇`}
            </span>
          </div>
          {apiUnavailable ? (
            <p className="notice">
              社区条目服务暂时不可用；上方系统教材仍可正常阅读，请稍后重试社区搜索。
            </p>
          ) : result.items.length === 0 ? (
            <div className="empty">
              <p>
                {filtered
                  ? '没有匹配的已发布社区条目。'
                  : '系统教材之外的实践经验，可由编辑者在工作台持续补充。'}
              </p>
              <Link to="/manage">进入编辑工作台 →</Link>
            </div>
          ) : (
            <ul className="entry-list">
              {result.items.map((item) => (
                <li key={item.id}>
                  <Link className="entry-title" to={`/p/${item.slug}`}>
                    {item.title}
                  </Link>
                  <p>{item.summary || '暂无摘要'}</p>
                  <div className="meta">
                    <Link to={`/?category=${encodeURIComponent(item.category)}`}>
                      {item.category}
                    </Link>
                    <span>发布于 {item.published_at?.slice(0, 10)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!apiUnavailable && (
            <Pager
              page={result.page}
              total={result.total}
              pageSize={result.page_size}
              href={pageHref}
            />
          )}
        </section>
      </main>
      <aside className="right-rail">
        <p className="nav-label">阅读路径</p>
        <p>开发路线：Linux → 服务器。</p>
        <p>硬件路线：Linux 工具 → 嵌入式 → 计算机系统。</p>
        <p>数学工具按需要交叉阅读，各章附例题、练习和参考。</p>
        <p className="small muted">教材当前为基础篇编辑稿，仍需逐章技术审校。</p>
        <Link to="/manage">维护社区条目 →</Link>
      </aside>
    </div>
  )
}
