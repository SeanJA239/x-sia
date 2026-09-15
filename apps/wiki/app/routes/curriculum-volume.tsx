import { data, Link, useLoaderData } from 'react-router'
import { CurriculumNav } from '../components/CurriculumNav'
import { LearningPlan } from '../components/LearningPlan'
import { chapterPath, volumeParts, volumePath } from '../lib/curriculum'
import { getVolume } from '../lib/curriculum.server'
import type { Route } from './+types/curriculum-volume'

export const headers = () => ({ 'Cache-Control': 'no-store' })
export function loader({ params }: Route.LoaderArgs) {
  const volume = getVolume(params.volume)
  if (!volume) throw new Response('教材不存在', { status: 404 })
  return data(volume, { headers: { 'Cache-Control': 'no-store' } })
}
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? '系统教材'} — X-SIA Wiki` }]
}
export default function CurriculumVolume() {
  const volume = useLoaderData<typeof loader>()
  return (
    <div className="reading-layout curriculum-layout">
      <aside className="sidebar curriculum-sidebar">
        <CurriculumNav volumeId={volume.id} />
      </aside>
      <main id="main" className="reading-main">
        <div className="breadcrumbs">
          <Link to="/">Wiki 总目</Link> / 系统教材
        </div>
        <p className="eyebrow">卷 {volume.number} / ENGINEERING FOUNDATIONS</p>
        <h1>{volume.title}</h1>
        <p className="lead">{volume.description}</p>
        <p className="notice">先修：{volume.prerequisites}</p>
        <div className="section-heading">
          <h2>本卷目录</h2>
          <span className="muted small">{volume.chapters.length} 章</span>
        </div>
        {volume.parts && (
          <nav className="volume-part-index" aria-label="分篇目录">
            {volume.parts.map((part) => (
              <a key={part.id} href={`#part-${part.id}`}>
                {part.title}
              </a>
            ))}
          </nav>
        )}
        {volumeParts(volume).map((part) => (
          <section className="volume-part" id={`part-${part.id}`} key={part.id}>
            {volume.parts && (
              <>
                <h2>{part.title}</h2>
                <p>{part.description}</p>
              </>
            )}
            <ol className="entry-list volume-chapters" start={part.chapters[0]?.number}>
              {part.chapters.map((chapter) => (
                <li key={chapter.id}>
                  <p className="eyebrow">第 {chapter.number} 章</p>
                  <h3>
                    <Link className="entry-title" to={chapterPath(volume.id, chapter.id)}>
                      {chapter.title}
                    </Link>
                  </h3>
                  <p>{chapter.summary}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <LearningPlan volumeId={volume.id} />
        <div className="article-bottom">
          <Link to={`${volumePath(volume.id)}/print`}>在 Wiki 中整卷阅读与打印 →</Link>
          <p>当前为基础篇编辑稿。教材源文件统一维护，社区条目另有网页编辑与修订记录。</p>
        </div>
      </main>
      <aside className="right-rail">
        <p className="nav-label">学习方式</p>
        <p>
          按章阅读机制解释，结合插图推导公式，再完成练习。先核对环境与假设，不直接在生产机器或未知硬件上执行示例。
        </p>
      </aside>
    </div>
  )
}
