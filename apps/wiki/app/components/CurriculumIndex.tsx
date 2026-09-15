import { Link } from 'react-router'
import {
  chapterPath,
  curriculum,
  curriculumChapters,
  volumeParts,
  volumePath,
} from '../lib/curriculum'

export function CurriculumIndex() {
  return (
    <section aria-label="系统教材与语言模块" className="curriculum-index" id="curriculum">
      <div className="section-heading">
        <h2>系统教材与编程语言</h2>
        <span className="muted small">
          {curriculumChapters.length} 章正文 · {curriculum.volumes.length} 个模块
        </span>
      </div>
      <p className="small muted">
        从概念到机制，配合例题、练习与中外参考。全部内容在 Wiki 内阅读。
        <Link to="/paths">查看完整学习路线与真实编写进度 →</Link>
      </p>
      <div className="curriculum-volumes">
        {curriculum.volumes.map((volume) => (
          <section className="curriculum-volume" key={volume.id}>
            <p className="eyebrow">卷 {volume.number}</p>
            <h3>
              <Link to={volumePath(volume.id)}>{volume.title}</Link>
            </h3>
            <p>{volume.description}</p>
            {volumeParts(volume).map((part) => (
              <section className="curriculum-index-part" key={part.id}>
                {volume.parts && (
                  <h4>
                    <Link to={`${volumePath(volume.id)}#part-${part.id}`}>{part.title}</Link>
                  </h4>
                )}
                <ol start={part.chapters[0]?.number}>
                  {part.chapters.map((chapter) => (
                    <li key={chapter.id}>
                      <Link to={chapterPath(volume.id, chapter.id)}>{chapter.title}</Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}
