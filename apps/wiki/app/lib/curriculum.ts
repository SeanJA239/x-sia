import catalog from '../../../books/catalog.json'

export const curriculum = catalog
export type CurriculumVolume = (typeof catalog.volumes)[number]
export type CurriculumChapter = CurriculumVolume['chapters'][number]
export function volumeParts(volume: CurriculumVolume) {
  const specs = volume.parts ?? [
    {
      id: 'main',
      title: '本卷目录',
      description: '',
      chapters: volume.chapters.map((chapter) => chapter.id),
    },
  ]
  const flat = specs.flatMap((part) => part.chapters)
  if (
    flat.join('|') !== volume.chapters.map((chapter) => chapter.id).join('|') ||
    new Set(flat).size !== flat.length ||
    specs.some((part) => !part.chapters.length) ||
    new Set(specs.map((part) => part.id)).size !== specs.length
  )
    throw new Error(`Invalid parts: ${volume.id}`)
  return specs.map((part) => ({
    ...part,
    chapters: part.chapters.map((id) => {
      const index = volume.chapters.findIndex((chapter) => chapter.id === id)
      return { ...volume.chapters[index], number: index + 1 }
    }),
  }))
}
export const curriculumChapters = catalog.volumes.flatMap((volume) =>
  volumeParts(volume).flatMap((part) =>
    part.chapters.map((chapter) => ({
      ...chapter,
      volumeId: volume.id,
      volumeTitle: volume.title,
      partId: part.id,
      partTitle: volume.parts ? part.title : '',
      key: `${volume.id}/${chapter.id}`,
    })),
  ),
)
export function volumePath(id: string) {
  return `/learn/${id}`
}
export function chapterPath(volume: string, chapter: string) {
  return `/learn/${volume}/${chapter}`
}
export { chapterHeadings, headingSlug } from './headings'
