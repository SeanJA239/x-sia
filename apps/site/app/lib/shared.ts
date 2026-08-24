export const appName = 'X-SIA'
export const appDescription = 'X-SIA 是身份、内容与权益一体的社团平台。'
export const docsRoute = '/docs'
export const docsImageRoute = '/og/docs'
export const docsContentRoute = '/llms.mdx/docs'
export const blogRoute = '/blog'

// TODO: replace with the real GitHub repo once it exists remotely.
export const gitConfig = {
  user: 'x-sia-club',
  repo: 'x-sia',
  branch: 'main',
}

export function getPageImagePath(slugs: string[], locale?: string) {
  return `/${[locale, ...docsImageRoute.split('/'), ...slugs, 'image.webp'].filter(Boolean).join('/')}`
}
