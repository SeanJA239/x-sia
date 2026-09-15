import { Link } from 'react-router'
import { chapterPath, curriculum, volumeParts, volumePath } from '../lib/curriculum'

export function CurriculumNav({ volumeId, chapterId }: { volumeId?: string; chapterId?: string }) {
  return (
    <nav aria-label="教材目录" className="curriculum-nav">
      <p className="nav-label">系统教材</p>
      <Link to="/">← Wiki 总目</Link>
      {curriculum.volumes.map((volume) => (
        <details key={volume.id} open={volume.id === volumeId}>
          <summary>{volume.title}</summary>
          <Link to={volumePath(volume.id)}>本卷导读</Link>
          {volumeParts(volume).map((part) => {
            const links = part.chapters.map((chapter) => (
              <Link
                key={chapter.id}
                to={chapterPath(volume.id, chapter.id)}
                aria-current={
                  volume.id === volumeId && chapter.id === chapterId ? 'page' : undefined
                }
              >
                {chapter.number}. {chapter.title}
              </Link>
            ))
            return volume.parts ? (
              <details
                className="curriculum-nav-part"
                key={part.id}
                open={
                  volume.id === volumeId &&
                  part.chapters.some((chapter) => chapter.id === chapterId)
                }
              >
                <summary>{part.title}</summary>
                {links}
              </details>
            ) : (
              <div key={part.id}>{links}</div>
            )
          })}
          <Link to={`${volumePath(volume.id)}/print`}>整卷阅读与打印</Link>
        </details>
      ))}
    </nav>
  )
}
