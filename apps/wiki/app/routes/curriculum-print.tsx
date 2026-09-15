import { data, Link, useLoaderData } from 'react-router'
import { CurriculumNav } from '../components/CurriculumNav'
import { Markdown } from '../components/Markdown'
import { chapterPath, volumeParts, volumePath } from '../lib/curriculum'
import { getVolume, getVolumeChapters } from '../lib/curriculum.server'
import type { Route } from './+types/curriculum-print'

export const headers = () => ({ 'Cache-Control': 'no-store' })
export function loader({ params }: Route.LoaderArgs) {
  const volume = getVolume(params.volume)
  if (!volume) throw new Response('教材不存在', { status: 404 })
  return data(
    {
      volume,
      chapters: getVolumeChapters(volume.id).map(({ plain: _plain, ...chapter }) => chapter),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.volume.title ?? '教材'} · 整卷 — X-SIA Wiki` }]
}
export default function CurriculumPrint() {
  const { volume, chapters } = useLoaderData<typeof loader>()
  const parts = volumeParts(volume).map((part) => ({
    ...part,
    chapters: chapters.filter((chapter) => part.chapters.some((item) => item.id === chapter.id)),
  }))
  return (
    <div className="reading-layout curriculum-layout curriculum-print">
      <aside className="sidebar curriculum-sidebar">
        <CurriculumNav volumeId={volume.id} />
      </aside>
      <main id="main" className="reading-main">
        <div className="breadcrumbs">
          <Link to="/">Wiki 总目</Link> / <Link to={volumePath(volume.id)}>{volume.title}</Link> /
          整卷阅读
        </div>
        <h1>{volume.title}</h1>
        <p className="lead">{volume.description}</p>
        <div className="toolbar">
          <button type="button" onClick={() => window.print()}>
            打印 / 保存 PDF
          </button>
          <span className="small muted">也可使用浏览器打印功能。分篇编辑稿。</span>
        </div>
        <nav aria-label="打印分篇目录">
          {parts.map((part) => (
            <div key={part.id}>
              {volume.parts && (
                <p>
                  <a href={`#print-part-${part.id}`}>{part.title}</a>
                </p>
              )}
              <ol start={part.chapters[0]?.number}>
                {part.chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <a href={`#chapter-${chapter.id}`}>{chapter.title}</a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>
        {parts.map((part) => (
          <section className="curriculum-print-part" id={`print-part-${part.id}`} key={part.id}>
            {volume.parts && (
              <>
                <h2>{part.title}</h2>
                <p>{part.description}</p>
              </>
            )}
            {part.chapters.map((chapter) => (
              <section
                className="curriculum-print-chapter"
                id={`chapter-${chapter.id}`}
                key={chapter.id}
              >
                <p className="eyebrow">第 {chapter.number} 章</p>
                {volume.parts ? (
                  <h3 className="curriculum-chapter-title">{chapter.title}</h3>
                ) : (
                  <h2 className="curriculum-chapter-title">{chapter.title}</h2>
                )}
                <Markdown
                  body={chapter.body}
                  textbook
                  headingPrefix={`${volume.id}-${chapter.id}`}
                  print
                  printDepth={volume.parts ? 2 : 1}
                />
                <p className="print-reading-link">
                  <Link to={chapterPath(volume.id, chapter.id)}>单章阅读 →</Link>
                </p>
              </section>
            ))}
          </section>
        ))}
      </main>
      <aside className="right-rail">
        <p className="nav-label">卷内目录</p>
        <nav aria-label="卷内目录">
          {parts.map((part) => (
            <div key={part.id}>
              {volume.parts && <p className="nav-label">{part.title}</p>}
              {part.chapters.map((chapter) => (
                <a key={chapter.id} href={`#chapter-${chapter.id}`}>
                  {chapter.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </div>
  )
}
