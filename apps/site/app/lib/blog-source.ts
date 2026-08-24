import { loader } from 'fumadocs-core/source'
import { pageSchema } from 'fumadocs-core/source/schema'
import { defineCollections } from 'fumadocs-mdx/macro'
import { z } from 'zod'
import { blogRoute } from './shared'

export const blogPosts = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: pageSchema.extend({
    description: z.string(),
    author: z.string(),
    date: z.string().date(),
  }),
})

export const blogSource = loader({
  source: blogPosts.toFumadocsSource(),
  baseUrl: blogRoute,
})

export function getSortedBlogPosts() {
  return blogSource
    .getPages()
    .slice()
    .sort((a, b) => (a.data.date < b.data.date ? 1 : -1))
}
