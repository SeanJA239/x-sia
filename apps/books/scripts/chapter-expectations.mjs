import { readFile } from 'node:fs/promises'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

// Derive browser expectations from source AST, not from the page being tested.
export async function chapterExpectations(catalog) {
  const result = new Map()
  for (const volume of catalog.volumes) {
    for (const chapter of volume.chapters) {
      const key = `${volume.id}/${chapter.id}`
      const source = await readFile(new URL(`../content/${key}.md`, import.meta.url), 'utf8')
      const tree = unified().use(remarkParse).parse(source)
      const figures = []
      function visit(node) {
        if (node.type === 'image' && node.url.startsWith('asset:')) figures.push(node.url.slice(6))
        for (const child of node.children ?? []) visit(child)
      }
      visit(tree)
      result.set(key, { figures, han: (source.match(/\p{Script=Han}/gu) ?? []).length })
    }
  }
  return result
}
