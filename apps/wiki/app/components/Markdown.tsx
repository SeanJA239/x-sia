import { createElement } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import { Link } from 'react-router'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { curriculumChapters } from '../lib/curriculum'
import { curriculumFigures, curriculumFigureUrls } from '../lib/curriculum-assets'
import { rehypeFootnoteLabels, remarkHeadingIds } from '../lib/headings'
import 'katex/dist/katex.min.css'

const chapterKeys = new Set(curriculumChapters.map((chapter) => chapter.key))

export function Markdown({
  body,
  textbook = false,
  headingPrefix = '',
  print = false,
  printDepth = 1,
}: {
  body: string
  textbook?: boolean
  headingPrefix?: string
  print?: boolean
  printDepth?: 1 | 2
}) {
  return (
    <div className={`markdown${textbook ? ' textbook-markdown' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, [remarkHeadingIds, { prefix: headingPrefix }]]}
        remarkRehypeOptions={{
          clobberPrefix: `${headingPrefix || 'wiki'}-`,
          footnoteLabel: '参考注释',
          footnoteBackLabel: '返回正文注记',
        }}
        rehypePlugins={[
          [rehypeFootnoteLabels, { prefix: headingPrefix }],
          [rehypeKatex, { trust: false, strict: false, maxExpand: 1000, maxSize: 20 }],
        ]}
        urlTransform={(url, key) => {
          if (key === 'src')
            return textbook && url.startsWith('asset:')
              ? (curriculumFigures.get(url.slice(6)) ?? '')
              : ''
          if (textbook && url.startsWith('book:'))
            return chapterKeys.has(url.slice(5)) ? `/wiki/learn/${url.slice(5)}` : ''
          return defaultUrlTransform(url)
        }}
        skipHtml
        components={{
          // Only bundled textbook figures are allowed; community images remain blocked.
          img: ({ alt, src }) =>
            textbook && src && curriculumFigureUrls.has(src) ? (
              <span className="textbook-figure">
                <img src={src} alt={alt || '技术图'} width={900} height={360} loading="lazy" />
                <span className="textbook-caption">{alt}</span>
              </span>
            ) : (
              <span className="notice">[图片：{alt || '未命名'}；尚未开放图片托管]</span>
            ),
          a: ({ node: _node, href, children, ...props }) =>
            href?.startsWith('/wiki/learn/') ? (
              <Link {...props} to={href.slice(5)}>
                {children}
              </Link>
            ) : (
              <a {...props} href={href}>
                {children}
              </a>
            ),
          h1: ({ id, children }) =>
            createElement(`h${2 + (print ? printDepth : 0)}`, { id }, children),
          h2: ({ id, children }) =>
            createElement(`h${2 + (print ? printDepth : 0)}`, { id }, children),
          h3: ({ id, children }) =>
            createElement(`h${3 + (print ? printDepth : 0)}`, { id }, children),
          h4: ({ id, children }) =>
            createElement(`h${4 + (print ? printDepth : 0)}`, { id }, children),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
