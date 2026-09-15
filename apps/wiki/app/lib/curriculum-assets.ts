const modules = import.meta.glob<string>('../../../books/assets/figures/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})
export const curriculumFigures = new Map(
  Object.entries(modules).map(([file, url]) => [
    file
      .split('/')
      .at(-1)
      ?.replace(/\.svg$/, '') ?? '',
    url,
  ]),
)
export const curriculumFigureUrls = new Set(curriculumFigures.values())
