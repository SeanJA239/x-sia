import { data, Link, useLoaderData } from 'react-router'
import { CurriculumNav } from '../components/CurriculumNav'
import { Markdown } from '../components/Markdown'
import { chapterHeadings, chapterPath, curriculumChapters, volumePath } from '../lib/curriculum'
import { getChapter, getVolume } from '../lib/curriculum.server'
import type { Route } from './+types/curriculum-chapter'

export const headers = () => ({ 'Cache-Control': 'no-store' })
export function loader({ params }: Route.LoaderArgs) {
  const found = getChapter(params.volume, params.chapter)
  const volume = getVolume(params.volume)
  if (!found || !volume) throw new Response('教材章节不存在', { status: 404 })
  const { plain: _plain, ...chapter } = found
  const prefix = `${volume.id}-${chapter.id}`
  const position = curriculumChapters.findIndex((item) => item.key === chapter.key)
  return data(
    {
      volume,
      chapter,
      prefix,
      headings: chapterHeadings(chapter.body, prefix),
      previous: curriculumChapters[position - 1] ?? null,
      next: curriculumChapters[position + 1] ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.chapter.title ?? '系统教材'} — X-SIA Wiki` },
    { name: 'description', content: loaderData?.chapter.summary ?? '' },
  ]
}
export default function CurriculumChapter() {
  const { volume, chapter, prefix, headings, previous, next } = useLoaderData<typeof loader>()
  return (
    <div className="reading-layout curriculum-layout">
      <aside className="sidebar curriculum-sidebar">
        <CurriculumNav volumeId={volume.id} chapterId={chapter.id} />
      </aside>
      <main id="main" className="reading-main">
        <div className="breadcrumbs">
          <Link to="/">Wiki 总目</Link> / <Link to={volumePath(volume.id)}>{volume.title}</Link> /
          {chapter.partTitle && (
            <>
              <Link to={`${volumePath(volume.id)}#part-${chapter.partId}`}>
                {chapter.partTitle}
              </Link>{' '}
              /{' '}
            </>
          )}
          第 {chapter.number} 章
        </div>
        <h1>{chapter.title}</h1>
        <p className="lead">{chapter.summary}</p>
        <div className="meta article-meta">
          <span>
            {volume.title} · 第 {chapter.number} 章
          </span>
          <span>{chapter.han.toLocaleString('zh-CN')} 汉字</span>
          <span>基础篇编辑稿</span>
          <Link to={`${volumePath(volume.id)}/print`}>整卷阅读与打印</Link>
        </div>
        <details className="curriculum-mobile-toc">
          <summary>本章目录</summary>
          <nav aria-label="移动端本章目录">
            {headings.map((heading) => (
              <a key={heading.id} href={`#${heading.id}`} data-depth={heading.depth}>
                {heading.text}
              </a>
            ))}
          </nav>
        </details>
        <article>
          <Markdown body={chapter.body} textbook headingPrefix={prefix} />
        </article>
        <nav className="curriculum-pager" aria-label="上下章">
          {previous ? (
            <Link to={chapterPath(previous.volumeId, previous.id)}>
              <span>上一章 · {previous.volumeTitle}</span>
              {previous.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={chapterPath(next.volumeId, next.id)}>
              <span>下一章 · {next.volumeTitle}</span>
              {next.title}
            </Link>
          ) : (
            <span />
          )}
        </nav>
        <div className="article-bottom">
          教材内容在 Wiki 原生页面中阅读，源稿统一维护于
          Markdown；未生成或冒充社区条目的发布修订。此稿仍需技术审校。
        </div>
      </main>
      <aside className="right-rail">
        <p className="nav-label">本章目录</p>
        <nav aria-label="本章目录">
          {headings.map((heading) => (
            <a key={heading.id} href={`#${heading.id}`} data-depth={heading.depth}>
              {heading.text}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  )
}
