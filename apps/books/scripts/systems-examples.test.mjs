import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const python = process.env.BOOKS_PYTHON || 'python'
const cc = process.env.BOOKS_CC || (process.platform === 'win32' ? 'gcc' : 'cc')
let directory
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-systems-'))
})
after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})
async function codeBlocks(chapter) {
  const text = await readFile(new URL(`../content/linux/${chapter}.md`, import.meta.url), 'utf8')
  return unified()
    .use(remarkParse)
    .parse(text)
    .children.filter((node) => node.type === 'code')
}
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: directory,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 128 * 1024,
  })
  if (result.error) throw result.error
  assert.equal(result.signal, null)
  return result
}
for (const [chapter, id] of [
  ['threads', 'threads-counter'],
  ['scheduling', 'scheduling-round-robin'],
  ['virtual-memory', 'memory-address'],
  ['dataflow', 'dataflow-bounded'],
  ['compiler', 'compiler-parser'],
]) {
  test(`Source example: ${id}`, async () => {
    const block = (await codeBlocks(chapter)).find(
      (node) => node.lang === 'python' && node.value.includes(`# example: ${id}`),
    )
    assert.ok(block, id)
    let code = block.value
    if (chapter === 'compiler')
      code +=
        '\nassert parse("(2+3)*4") == ("*", ("+", ("int", 2), ("int", 3)), ("int", 4))\nassert parse("12 / 3 / 2") == ("/", ("/", ("int", 12), ("int", 3)), ("int", 2))\n'
    const file = `${id}.py`
    await writeFile(path.join(directory, file), code)
    const result = run(python, [file])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '')
  })
}
test('Two-file C build resolves symbols; omitted definition fails linking', async () => {
  const blocks = (await codeBlocks('toolchain')).filter((node) => node.lang === 'c')
  for (const file of ['add.h', 'add.c', 'main.c']) {
    const block = blocks.find((node) => node.value.startsWith(`/* ${file} */`))
    assert.ok(block, file)
    await writeFile(path.join(directory, file), block.value)
  }
  for (const name of ['add', 'main']) {
    const result = run(cc, [
      '-std=c17',
      '-Wall',
      '-Wextra',
      '-Wpedantic',
      '-c',
      `${name}.c`,
      '-o',
      `${name}.o`,
    ])
    assert.equal(result.status, 0, result.stderr)
  }
  const executable = process.platform === 'win32' ? 'demo.exe' : 'demo'
  const linked = run(cc, ['main.o', 'add.o', '-o', executable])
  assert.equal(linked.status, 0, linked.stderr)
  const executed = run(path.join(directory, executable), [])
  assert.equal(executed.status, 0, executed.stderr)
  assert.equal(executed.stdout.replaceAll('\r\n', '\n'), '5\n')
  const missing = run(cc, ['main.o', '-o', 'missing-definition'])
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /undefined reference|unresolved external/i)
})
test('Worked models: page tables, pipeline cycles, queue capacity and liveness', () => {
  assert.deepEqual([0x00403004 >>> 22, (0x00403004 >>> 12) & 1023, 0x00403004 & 4095], [1, 3, 4])
  assert.equal((100 + 5 - 1) * (220 + 20), 24960)
  assert.equal(Math.min(1 / 0.002, 2 / 0.01, 1 / 0.004), 200)
  assert.equal(500 / (300 - 200), 5)
  const use = new Set(),
    out = new Set(['a']),
    def = new Set(['a'])
  const incoming = new Set([...use, ...[...out].filter((value) => !def.has(value))])
  assert.deepEqual([...incoming], [])
})
