import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const root = new URL('../', import.meta.url)
const sources = JSON.parse(
  await readFile(new URL('assets/third-party/ai-infra/sources.json', root), 'utf8'),
)
const license = await readFile(new URL('assets/third-party/ai-infra/LICENSE.txt', root), 'utf8')
const hash = (text) => createHash('sha256').update(text).digest('hex')
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
test('Fixed-revision attribution, complete license and twenty-four original SVG identities', async () => {
  assert.equal(sources.revision, '58636943ba89f24b854f04f0f8f2fffe7b323829')
  assert.equal(sources.records.length, 16)
  assert.equal(sources.images.length, 24)
  assert.equal(hash(license), sources.licenseSha256)
  assert.match(license, /Copyright 2026 Bojie Li/)
  for (const image of sources.images) {
    const bytes = await readFile(new URL(`assets/third-party/ai-infra/${image.file}`, root))
    assert.equal(hash(bytes), image.sha256)
    assert.equal(image.modified, false)
  }
})
test('Six chapters retain source notices, single insertion blocks and resolvable footnotes', async () => {
  const targets = [...new Set(sources.records.map((record) => record.target))]
  assert.equal(targets.length, 6)
  for (const target of targets) {
    const body = await readFile(new URL(`content/${target}.md`, root), 'utf8')
    assert.equal(body.split('<!-- AI-INFRA-BEGIN -->').length, 2)
    assert.equal(body.split('<!-- AI-INFRA-END -->').length, 2)
    assert.ok(body.includes(license.trimEnd()))
    assert.ok(body.includes('不代表 X-SIA 已完成对应实测'))
    const definitions = new Set(),
      references = [],
      figures = []
    walk(parser.parse(body), (node) => {
      if (node.type === 'footnoteDefinition') definitions.add(node.identifier)
      if (node.type === 'footnoteReference') references.push(node.identifier)
      if (node.type === 'image' && node.url.startsWith('asset:aib-')) figures.push(node.url)
    })
    assert.ok(references.length > 0, `${target}: missing source footnotes`)
    assert.ok(figures.length > 0, `${target}: missing original figures`)
    assert.ok(
      references.every((id) => definitions.has(id)),
      target,
    )
    const rawLabels = [...body.matchAll(/\[\^(ai-[^\]]+)\]/g)].map((match) =>
      match[1].toLowerCase(),
    )
    assert.ok(
      rawLabels.every((id) => definitions.has(id)),
      `${target}: unresolved literal footnote`,
    )
  }
})
test('Original display equations keep double-dollar delimiters and equation tags', async () => {
  const body = await readFile(new URL('content/linux/dataflow.md', root), 'utf8')
  const display = []
  walk(parser.parse(body), (node) => {
    if (node.type === 'math') display.push(node.value)
  })
  assert.ok(display.some((value) => value.includes('\\tag{6-7}')))
})
