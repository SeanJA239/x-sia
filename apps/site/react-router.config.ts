import { glob } from 'node:fs/promises'
import type { Config } from '@react-router/dev/config'
import { createGetUrl, getSlugs } from 'fumadocs-core/source'
import { getPageImagePath } from './app/lib/shared'

const getUrl = createGetUrl('/docs')

export default {
  ssr: true,
  async prerender({ getStaticPaths }) {
    const paths: string[] = []
    const excluded: string[] = ['/api/search']

    for (const path of getStaticPaths()) {
      if (!excluded.includes(path)) paths.push(path)
    }

    for await (const entry of glob('**/*.mdx', { cwd: 'content/docs' })) {
      const slugs = getSlugs(entry)

      paths.push(getUrl(slugs))
      paths.push(getPageImagePath(slugs))
    }

    for await (const entry of glob('**/*.mdx', { cwd: 'content/blog' })) {
      paths.push(`/blog/${entry.replace(/\.mdx$/, '')}`)
    }

    // Renders the `*` catch-all route (routes/not-found.tsx) to `/404/index.html`;
    // the postbuild step in package.json flattens it to `/404.html` for CF Pages.
    paths.push('/404')

    return paths
  },
} satisfies Config
