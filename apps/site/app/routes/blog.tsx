import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { Link } from 'react-router'
import { getSortedBlogPosts } from '@/lib/blog-source'
import { baseOptions } from '@/lib/layout.shared'
import { appName } from '@/lib/shared'
import type { Route } from './+types/blog'

export function meta(_: Route.MetaArgs) {
  return [
    { title: `Blog | ${appName}` },
    { name: 'description', content: '社团精选轨的文章——技术分享、活动复盘、社团理念。' },
  ]
}

export async function loader() {
  const posts = getSortedBlogPosts().map((page) => ({
    url: page.url,
    title: page.data.title,
    description: page.data.description,
    author: page.data.author,
    date: page.data.date,
  }))

  return { posts }
}

export default function BlogIndex({ loaderData }: Route.ComponentProps) {
  const { posts } = loaderData

  return (
    <HomeLayout {...baseOptions()}>
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="font-mono text-xs tracking-wide text-fd-muted-foreground uppercase">Blog</p>
        <h1 className="mt-2 text-2xl font-semibold text-fd-foreground">精选轨文章</h1>
        <p className="mt-2 text-sm text-fd-muted-foreground">
          门面站 <code>blog/</code> 目录下的文章——通过 PR 投稿,由干事审核。想投稿看
          <Link to="/docs/contributing" className="text-fd-info underline underline-offset-4">
            {' '}
            投稿指南
          </Link>
          。
        </p>

        <ul className="mt-10 divide-y divide-fd-border border-t border-fd-border">
          {posts.map((post) => (
            <li key={post.url}>
              <Link
                to={post.url}
                className="group flex flex-col gap-1.5 py-6 transition-colors hover:bg-fd-accent/40 sm:px-2"
              >
                <span className="font-mono text-xs text-fd-muted-foreground">
                  {post.date} · {post.author}
                </span>
                <span className="text-lg font-medium text-fd-foreground group-hover:text-fd-info">
                  {post.title}
                </span>
                <span className="text-sm text-fd-muted-foreground">{post.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </HomeLayout>
  )
}
