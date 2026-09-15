import { Link } from 'react-router'
import paths from '../../../books/learning-paths.json'

export function LearningPlan({ volumeId, trackId }: { volumeId: string; trackId?: string }) {
  const tracks = paths.tracks.filter(
    (track) => track.volume === volumeId && (!trackId || track.id === trackId),
  )
  return (
    <section className="learning-plan" aria-label="后续学习路线与参考">
      <h2>从入门到工程实践</h2>
      <p className="small muted">
        以下是完整教材的编写路线，不是已完成章节。现有正文以卷内可点击目录为准。
      </p>
      {tracks.map((track) => (
        <section key={track.id}>
          <h3>{track.title} 学习路线</h3>
          <div className="learning-stages">
            {track.stages.map((stage, index) => (
              <section key={stage.title}>
                <h4>
                  {index + 1}. {stage.title}
                </h4>
                <ul>
                  {stage.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <h4>国内外参考与选读目的</h4>
          <ul className="reference-list">
            {track.references.map((reference) => (
              <li key={reference.url}>
                <a href={reference.url} rel="noreferrer">
                  {reference.title}
                </a>{' '}
                <span className="muted small">{reference.language}</span>
                <p>{reference.purpose}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Link to="/paths">查看全部主题的编写进度与路线 →</Link>
    </section>
  )
}
