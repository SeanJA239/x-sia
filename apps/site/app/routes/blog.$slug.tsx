import { DocsBody } from 'fumadocs-ui/layouts/docs/page'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { Link } from 'react-router'
import { useMDXComponents } from '@/components/mdx'
import { blogPosts, blogSource } from '@/lib/blog-source'
import { baseOptions } from '@/lib/layout.shared'
import { appName } from '@/lib/shared'
import type { Route } from './+types/blog.$slug'

export async function loader({ params }: Route.LoaderArgs) {
  const page = blogSource.getPage([params.slug])
  if (!page) throw new Response('Not found', { status: 404 })

  return { path: page.path }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const post = loaderData ? blogPosts.get(loaderData.path) : undefined
  if (!post) return [{ title: `Blog | ${appName}` }]

  return [
    { title: `${post.title} | ${appName} Blog` },
    { name: 'description', content: post.description },
  ]
}

export default function BlogPost({ loaderData }: Route.ComponentProps) {
  const post = blogPosts.get(loaderData.path)
  if (!post) throw new Error(`unknown blog post: ${loaderData.path}`)

  const Mdx = post.body

  return (
    <HomeLayout {...baseOptions()}>
      <article className="mx-auto w-full max-w-3xl px-6 py-16">
        <Link to="/blog" className="text-sm text-fd-muted-foreground hover:text-fd-foreground">
          ← Blog
        </Link>
        <h1 className="mt-4 text-3xl font-semibold text-fd-foreground">{post.title}</h1>
        <p className="mt-2 font-mono text-xs text-fd-muted-foreground">
          {post.date} · {post.author}
        </p>
        <DocsBody className="mt-10">
          <Mdx components={useMDXComponents()} />
        </DocsBody>
      </article>
    </HomeLayout>
  )
}
