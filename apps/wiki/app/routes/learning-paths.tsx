import { Link, useLoaderData } from 'react-router'
import aiInfra from '../../../books/ai-infra-map.json'
import paths from '../../../books/learning-paths.json'
import { CurriculumNav } from '../components/CurriculumNav'
import { LearningPlan } from '../components/LearningPlan'
import { chapterPath, volumePath } from '../lib/curriculum'
import { searchCurriculum } from '../lib/curriculum.server'
import type { Route } from './+types/learning-paths'

export const meta = () => [{ title: '学习路线与参考 — X-SIA Wiki' }]
export const headers = () => ({ 'Cache-Control': 'no-store' })
export function loader(_args: Route.LoaderArgs) {
  const chapters = searchCurriculum()
  return {
    progress: paths.tracks.map((track) => {
      const written = chapters.filter(
        (chapter) =>
          chapter.volumeId === track.volume &&
          (!('chapter' in track) || chapter.id === track.chapter),
      )
      return {
        id: track.id,
        chapters: written.length,
        han: written.reduce((sum, chapter) => sum + chapter.han, 0),
      }
    }),
  }
}
export default function LearningPaths() {
  const { progress } = useLoaderData<typeof loader>()
  return (
    <div className="reading-layout curriculum-layout">
      <aside className="sidebar curriculum-sidebar">
        <CurriculumNav />
      </aside>
      <main id="main" className="reading-main">
        <p className="eyebrow">WIKI / LEARNING PATHS</p>
        <h1>学习路线与参考</h1>
        <p className="lead">每个主题独立建设，循序进入机制、工程与综合项目。</p>
        <p className="notice">
          {paths.target} 目前尚未达到完整专业教材体量，下表只统计真实正文，不计算待编写目录。
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>独立主题</th>
                <th>已写正文</th>
                <th>实际汉字</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {paths.tracks.map((track) => {
                const current = progress.find((item) => item.id === track.id)
                return (
                  <tr key={track.id}>
                    <td>
                      <Link
                        to={
                          typeof track.chapter === 'string'
                            ? chapterPath(track.volume, track.chapter)
                            : volumePath(track.volume)
                        }
                      >
                        {track.title}
                      </Link>
                    </td>
                    <td>{current?.chapters} 章</td>
                    <td>{current?.han.toLocaleString('zh-CN')}</td>
                    <td>{track.editorialStatus ?? '基础稿 · 后续章节待编写'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <section id="ai-infra-map">
          <h2>AI Infra 原著如何进入我们的层级</h2>
          <p>
            <a href={aiInfra.repository}>{aiInfra.title}</a> · {aiInfra.author} · {aiInfra.license}
          </p>
          <p>
            固定版本 <code>{aiInfra.revision.slice(0, 12)}</code>。已将 16 个小节（含 1 个部分节）和
            24 幅原著 SVG
            选编到六章。以下区分实际正文与后续归类；不是十二章全文镜像。来源、修改说明、脚注和完整许可随正文保留。
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>上游章</th>
                  <th>我们的归属</th>
                  <th>状态与正文</th>
                </tr>
              </thead>
              <tbody>
                {aiInfra.rows.map((row) => (
                  <tr key={row.chapter}>
                    <td>
                      {row.chapter}. {row.title}
                    </td>
                    <td>{row.placement}</td>
                    <td>
                      {row.status}
                      {row.links.map((link) => (
                        <p key={link.to}>
                          <Link to={link.to}>{link.label} →</Link>
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2>图片来源规则</h2>
          <p>
            使用有明确许可的真实教程原图，并保留作者、来源、许可和校验值；无转载许可的材料只链接原文，不热链或复制。已在
            Rust 章引入三幅官方教材原图，固定版本、MIT 许可、未经修改，完整许可随正文保留。
          </p>
        </section>
        {['linux', 'servers', 'embedded', 'systems', 'math', 'languages'].map((volume) => (
          <LearningPlan key={volume} volumeId={volume} />
        ))}
      </main>
      <aside className="right-rail">
        <p className="nav-label">编写质量</p>
        <p>先修 → 示例 → 机制 → 边界 → 练习 → 项目 → 参考。</p>
        <p>写作完成、代码运行、技术审校与图文校对分别记录，不以其中一项代替全部。</p>
      </aside>
    </div>
  )
}
