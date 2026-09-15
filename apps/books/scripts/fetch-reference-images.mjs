// Explicit, manual acquisition of openly licensed reference images. Never runs during a build.
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function get(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'X-SIA-educational-reference-archiver' },
  })
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.text()
}
const commit = JSON.parse(await get('https://api.github.com/repos/rust-lang/book/commits/main')).sha
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid upstream revision')
const base = `https://raw.githubusercontent.com/rust-lang/book/${commit}`
const license = await get(`${base}/LICENSE-MIT`)
if (
  !license.includes('Permission is hereby granted') ||
  !license.includes('The Rust Project Developers')
)
  throw new Error('Unexpected license; manual review required')
const directory = path.join(root, 'assets/third-party/rust')
await mkdir(directory, { recursive: true })
await writeFile(path.join(directory, 'LICENSE-MIT.txt'), license)
const records = []
for (const [file, id, caption] of [
  ['trpl04-01.svg', 'rust-string-layout', 'String 的指针、长度、容量与堆数据'],
  ['trpl04-02.svg', 'rust-string-move', '移动时栈上元数据与堆数据的关系'],
  ['trpl04-04.svg', 'rust-string-clone', '深拷贝产生独立堆分配'],
]) {
  const sourceUrl = `${base}/src/img/${file}`
  const svg = await get(sourceUrl)
  if (
    !svg.includes('<svg') ||
    /<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:|\/\/)/i.test(
      svg,
    )
  )
    throw new Error(`Unsafe SVG: ${file}`)
  await writeFile(path.join(directory, file), svg)
  records.push({
    id,
    file,
    caption,
    sourceUrl,
    originalPage: 'https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html',
    upstreamRevision: commit,
    creator: 'The Rust Project Developers / The Rust Programming Language contributors',
    license: 'MIT (selected from the repository dual MIT/Apache-2.0 license)',
    licenseFile: 'LICENSE-MIT.txt',
    modified: false,
    sha256: createHash('sha256').update(svg).digest('hex'),
  })
}
await writeFile(
  path.join(directory, 'sources.json'),
  JSON.stringify({ retrievedAt: new Date().toISOString(), images: records }, null, 2),
)
console.log(
  `Archived ${records.length} official Rust Book images at ${commit}; MIT license retained.`,
)
