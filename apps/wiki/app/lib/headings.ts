import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

type MdNode = {
  type: string
  value?: string
  depth?: number
  children?: MdNode[]
  data?: { hProperties?: Record<string, unknown> }
}
type HtmlNode = { properties?: Record<string, unknown>; children?: HtmlNode[] }
export function rehypeFootnoteLabels(options: { prefix: string }) {
  return (tree: HtmlNode) => {
    const label = `${options.prefix || 'wiki'}-footnote-label`
    function walk(node: HtmlNode) {
      if (node.properties?.id === 'footnote-label') node.properties.id = label
      if (Array.isArray(node.properties?.ariaDescribedBy))
        node.properties.ariaDescribedBy = node.properties.ariaDescribedBy.map((id) =>
          id === 'footnote-label' ? label : id,
        )
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  }
}
export type HeadingEntry = { id: string; text: string; depth: number }
export function headingSlug(text: string) {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'section'
  )
}
const nodeText = (node: MdNode): string =>
  node.value ?? (node.children ?? []).map(nodeText).join('')
function assign(tree: MdNode, prefix: string) {
  const counts = new Map<string, number>()
  const headings: HeadingEntry[] = []
  function walk(node: MdNode) {
    if (node.type === 'heading' && node.depth) {
      const text = nodeText(node)
      const base = headingSlug(text)
      const count = (counts.get(base) ?? 0) + 1
      counts.set(base, count)
      const id = `${prefix ? `${prefix}-` : ''}${base}${count > 1 ? `-${count}` : ''}`
      node.data ??= {}
      node.data.hProperties = { ...node.data.hProperties, id }
      if (node.depth >= 2 && node.depth <= 4) headings.push({ id, text, depth: node.depth })
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return headings
}
// Stable AST IDs: React may render a heading component more than once.
export function remarkHeadingIds(options: { prefix?: string } = {}) {
  return (tree: MdNode) => {
    assign(tree, options.prefix ?? '')
  }
}
export function chapterHeadings(body: string, prefix: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(body)
  return assign(tree, prefix)
}
