import { curriculum, curriculumChapters } from './curriculum'

const modules = import.meta.glob<string>('../../../books/content/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const chapters = curriculumChapters.map((chapter) => {
  const source = modules[`../../../books/content/${chapter.key}.md`]
  if (!source?.startsWith(`# ${chapter.title}\n`))
    throw new Error(`Missing curriculum source: ${chapter.key}`)
  const body = source.replace(/^# .+\r?\n/, '').trim()
  const plain = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`]/g, '')
    .replace(/\s+/g, ' ')
  return { ...chapter, body, plain, han: (source.match(/\p{Script=Han}/gu) ?? []).length }
})
export function getVolume(id: string) {
  return curriculum.volumes.find((volume) => volume.id === id)
}
export function getChapter(volume: string, id: string) {
  return chapters.find((chapter) => chapter.volumeId === volume && chapter.id === id)
}
export function getVolumeChapters(volume: string) {
  return chapters.filter((chapter) => chapter.volumeId === volume)
}
export function searchCurriculum(query = '', category = '') {
  const q = query.trim().toLocaleLowerCase().slice(0, 100)
  return chapters
    .filter(
      (chapter) =>
        (!category || chapter.volumeTitle === category) &&
        (!q || `${chapter.title} ${chapter.plain}`.toLocaleLowerCase().includes(q)),
    )
    .map(({ body: _body, plain, ...chapter }) => {
      const at = plain.toLocaleLowerCase().indexOf(q)
      const start = Math.max(0, at - 40)
      return {
        ...chapter,
        excerpt: q ? `${start > 0 ? '…' : ''}${plain.slice(start, start + 150)}…` : chapter.summary,
      }
    })
}
