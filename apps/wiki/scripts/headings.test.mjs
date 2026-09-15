import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { chapterHeadings, rehypeFootnoteLabels, remarkHeadingIds } from '../app/lib/headings.ts'

const body =
  '## Same\n\n### **Same**\n\n#### [API](https://example.com) `v1`\n\n```md\n## Hidden\n```\n\nUnderlined\n----------\n'
const expected = ['lesson-same', 'lesson-same-2', 'lesson-api-v1', 'lesson-underlined']
test('TOC uses actual Markdown hierarchy, ignores fences and handles formatted titles', () => {
  const headings = chapterHeadings(body, 'lesson')
  assert.deepEqual(
    headings.map((heading) => heading.id),
    expected,
  )
  assert.deepEqual(
    headings.map((heading) => heading.depth),
    [2, 3, 4, 2],
  )
})
test('Repeated AST transformations keep stable IDs rather than incrementing render counters', () => {
  const tree = unified().use(remarkParse).parse(body)
  const apply = remarkHeadingIds({ prefix: 'lesson' })
  for (let i = 0; i < 4; i++) {
    apply(tree)
    assert.deepEqual(
      tree.children
        .filter((node) => node.type === 'heading')
        .map((node) => node.data.hProperties.id),
      expected,
    )
  }
})
test('Footnote IDs and accessibility labels are scoped per chapter', () => {
  const html = ['one', 'two']
    .map((prefix) =>
      renderToStaticMarkup(
        createElement(
          ReactMarkdown,
          {
            remarkPlugins: [remarkGfm],
            remarkRehypeOptions: { clobberPrefix: `${prefix}-` },
            rehypePlugins: [[rehypeFootnoteLabels, { prefix }]],
          },
          'Text[^note]\n\n[^note]: Source.',
        ),
      ),
    )
    .join('')
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  assert.equal(new Set(ids).size, ids.length)
  assert.match(html, /aria-describedby="one-footnote-label"/)
  assert.match(html, /aria-describedby="two-footnote-label"/)
})
test('Server-rendered heading IDs match the TOC over repeated renders', () => {
  for (let i = 0; i < 4; i++) {
    const html = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: [remarkGfm, remarkMath, [remarkHeadingIds, { prefix: 'lesson' }]],
          skipHtml: true,
        },
        body,
      ),
    )
    assert.deepEqual(
      [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1]),
      expected,
    )
  }
})
