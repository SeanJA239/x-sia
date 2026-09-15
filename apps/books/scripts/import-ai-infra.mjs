// Manual, fixed-revision literary integration. Never executed by normal builds.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const root = fileURLToPath(new URL('../', import.meta.url))
const cache = path.resolve(root, '../../.local/ai-infra-reference')
const destination = path.join(root, 'assets/third-party/ai-infra')
const revision = '58636943ba89f24b854f04f0f8f2fffe7b323829'
const sourceManifest = JSON.parse(await readFile(path.join(cache, 'source-manifest.json'), 'utf8'))
const archived = await readFile(path.join(destination, 'sources.json'), 'utf8')
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
if (sourceManifest.revision !== revision) throw Error('Unreviewed source revision')
const license = await readFile(path.join(cache, 'LICENSE'), 'utf8')
if (!license.includes('Copyright 2026 Bojie Li') || !license.includes('Version 2.0, January 2004'))
  throw Error('License mismatch')
const selections = [
  {
    target: 'math/linear',
    title: 'AI Infra 进阶：由矩阵工作量推导资源预算',
    bridge:
      '承接本章的矩阵模型，下面把运算次数与数据字节数分别换成执行时间。原著采用的 70B 模型是 DeepSeek-R1-Distill-Llama-70B，约 705.54 亿参数；BF16 权重约 141.11 GB，含分组量化附加数据的 8 位方案给定为 73.73 GB。这些容量沿用原著 1.2.3 的配置结果，不等于直接把参数个数乘一字节。下文再用约 70 GB 的主要权重读取量做简化推导，容量、每步流量和实际可并发请求数必须分开。',
    sections: [
      ['01', '1.2.2'],
      ['01', '1.3.1'],
      ['01', '1.3.2'],
    ],
  },
  {
    target: 'linux/virtual-memory',
    title: 'AI Infra 进阶：加速器存储与在途并发',
    bridge:
      '这里把对象从 CPU 进程映射扩展到加速器存储。HBM、共享内存与寄存器不是 Linux 页表的同义词，但仍应区分驻留容量、每级接口流量和在途访问。下面的型号参数和模型配置作为上游固定版的给定条件使用，不能直接拿本机 free 的输出代入显存预算。',
    sections: [
      ['04', '4.3.1'],
      ['04', '4.3.2'],
      ['04', '4.3.3'],
    ],
  },
  {
    target: 'linux/dataflow',
    title: 'AI Infra 进阶：搬移流水与模型流水线并行',
    bridge:
      '前面讲软件队列的容量和关闭协议，下面分别把同一思路用于单设备搬移缓冲与跨设备模型阶段。第一种模型关心输入槽从发出请求到最后使用的生命周期，第二种模型关心相互独立的 micro-batch。原著给定的 tick 是其加速器算例单位，不是本机实测；同一自回归会话尚未生成的未来 token 也不能当成独立微批。',
    sections: [
      ['04', '4.4.2'],
      ['06', '6.2.5'],
    ],
  },
  {
    target: 'linux/compiler',
    title: 'AI Infra 进阶：循环分块、融合与数值合法性',
    bridge:
      '本章的解析器只解决结构问题，下面继续看后端怎样安排已经确定语义的张量计算。原著沿用 FFN 投影 M=1024、K=4096、N=12288，输入和输出使用 BF16、累加使用 FP32。以下 load_tile、round_to_bf16 等名称用于说明调度的伪代码，不是我们已经提供实现并运行过的 Python 函数。变换顺序必须同时满足依赖和舍入规则。',
    sections: [
      ['05', '5.4.2'],
      ['05', '5.4.3'],
      ['05', '5.4.4'],
    ],
  },
  {
    target: 'linux/io',
    title: 'AI Infra 进阶：主机、加速器与完成事件',
    bridge:
      '前面区分了 I/O 提交与完成，下面换成 CPU 与 GPU 协作的矩阵运算。这里的 GPU kernel 是设备上执行的计算程序，不是 Linux 内核；stream 是设备任务序列，也不是 Shell 的字节管道。相同的缓冲区生命周期原则仍然适用：提交返回、复制完成、计算用完与 CPU 可以读取结果，是不同时间点。',
    sections: [
      ['05', '5.1.1'],
      ['05', '5.1.2'],
      ['05', '5.1.3'],
      ['05', '5.1.4'],
    ],
  },
  {
    target: 'servers/network',
    title: 'AI Infra 进阶：跨节点请求槽位与吞吐上界',
    bridge:
      '本章已经区分带宽与 RTT，这里进一步加入请求记录的占用时间和提交速率。下面采用原著给定的 50 GB/s 路径、256 B 载荷、2 微秒槽位周期等参数做推导；它们不是任意 RDMA 或 PCIe 平台都具有的常数。本批保留模型与例题，未选入该节后半的具体平台实测比较。',
    sections: [['07', '7.3.4']],
    stopBefore: '启动间隔 $\\delta$ 的一个具体来源',
  },
]
const sources = new Map(),
  images = new Map(),
  records = [],
  pendingChapters = []
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const textOf = (node) => node.value ?? (node.children ?? []).map(textOf).join('')
function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
async function source(chapter) {
  if (sources.has(chapter)) return sources.get(chapter)
  const entry = sourceManifest.files.find((item) => item.local === `source/ch${chapter}.md`)
  if (!entry) throw Error(`Missing source ${chapter}`)
  const text = await readFile(path.join(cache, entry.local), 'utf8')
  if (hash(text) !== entry.sha256) throw Error(`Source changed: ${chapter}`)
  const value = { text, entry, tree: parser.parse(text) }
  sources.set(chapter, value)
  return value
}
function remoteLink(url, sourcePath) {
  if (/^https?:\/\//i.test(url)) return url.replace(/^http:/i, 'https:')
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//'))
    throw Error(`Unsupported source URL: ${url}`)
  const [name, fragment] = url.split('#')
  const resolved = name
    ? path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), name))
    : sourcePath
  if (resolved.startsWith('../') || resolved.startsWith('/'))
    throw Error('Reference escaped repository')
  return `https://github.com/bojieli/ai-infra-book/blob/${revision}/${encodeURI(resolved)}${fragment ? `#${encodeURI(fragment)}` : ''}`
}
function transform(text, chapter, target, sourcePath, needed) {
  // An isolated excerpt has no definitions yet, so Markdown parsers treat its
  // footnote uses as text. Collect the source labels before parsing the excerpt.
  for (const match of text.matchAll(/\[\^([^\]]+)\]/g)) needed.add(match[1].toLowerCase())
  const edits = []
  walk(parser.parse(text), (node) => {
    if (node.type === 'footnoteReference') needed.add(node.identifier)
    if (node.type === 'image') {
      if (!/^ch\d\d\/[a-z0-9-]+\.svg$/.test(node.url)) throw Error(`Unreviewed image ${node.url}`)
      const id = `aib-${node.url.replace('/', '-').replace(/\.svg$/, '')}`
      images.set(id, { id, file: `${id}.svg`, path: `manuscripts/${node.url}` })
      const alt = (node.alt || '原著图解').replace(/[[\]]/g, '\\$&')
      edits.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
        text: `![${alt}](asset:${id})`,
      })
    } else if (node.type === 'link') {
      const label = text
        .slice(node.position.start.offset, node.position.end.offset)
        .match(/^\[([\s\S]*?)\]\(/)?.[1]
      if (label === undefined) throw Error('Unsupported inline reference syntax')
      edits.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
        text: `[${label}](${remoteLink(node.url, sourcePath)})`,
      })
    } else if (node.type === 'definition') {
      edits.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
        text: `[${node.identifier}]: ${remoteLink(node.url, sourcePath)}`,
      })
    } else if (node.type === 'heading') {
      edits.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
        text: `${'#'.repeat(Math.max(3, Math.min(4, node.depth)))} 原著 ${textOf(node)}`,
      })
    }
  })
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
  return text.replace(
    /\[\^([^\]]+)\]/g,
    (_, id) => `[^ai-${target.replace('/', '-')}-${chapter}-${id}]`,
  )
}
await mkdir(destination, { recursive: true })
await writeFile(path.join(destination, 'LICENSE.txt'), license)
for (const selection of selections) {
  const excerpts = [],
    definitions = [],
    seen = new Set()
  for (const [chapter, section] of selection.sections) {
    const original = await source(chapter)
    const nodes = original.tree.children
    const index = nodes.findIndex(
      (node) => node.type === 'heading' && textOf(node).startsWith(`${section} `),
    )
    if (index < 0) throw Error(`Missing section ${chapter}/${section}`)
    const heading = nodes[index]
    const next = nodes
      .slice(index + 1)
      .find((node) => node.type === 'heading' && node.depth <= heading.depth)
    const start = heading.position.start.offset,
      end = next?.position.start.offset ?? original.text.length
    let excerpt = original.text.slice(start, end).trim()
    if (selection.stopBefore) {
      const stop = excerpt.indexOf(selection.stopBefore)
      if (stop < 0) throw Error('Missing explicit excerpt boundary')
      excerpt = excerpt.slice(0, stop).trim()
    }
    const needed = new Set()
    excerpts.push(transform(excerpt, chapter, selection.target, original.entry.path, needed))
    while (needed.size) {
      const id = needed.values().next().value
      needed.delete(id)
      const key = `${chapter}:${id}`
      if (seen.has(key)) continue
      seen.add(key)
      const definition = nodes.find(
        (node) => node.type === 'footnoteDefinition' && node.identifier === id,
      )
      if (!definition) throw Error(`Unresolved footnote ${key}`)
      definitions.push(
        transform(
          original.text.slice(definition.position.start.offset, definition.position.end.offset),
          chapter,
          selection.target,
          original.entry.path,
          needed,
        ),
      )
    }
    records.push({
      target: selection.target,
      chapter,
      section,
      sourcePath: original.entry.path,
      sourceSha256: original.entry.sha256,
      startLine: heading.position.start.line,
      excerptOriginalSha256: hash(excerpt),
      shortenedBefore: selection.stopBefore ?? null,
    })
  }
  const urls = [...new Set(selection.sections.map(([chapter]) => sources.get(chapter).entry.path))]
    .map(
      (file) =>
        `[${file}](https://github.com/bojieli/ai-infra-book/blob/${revision}/${encodeURI(file)})`,
    )
    .join('；')
  const block = `<!-- AI-INFRA-BEGIN -->\n## ${selection.title}\n\n> 来源：李博杰《深入理解 AI Infra：量化分析与系统设计》，Copyright 2026 Bojie Li，Apache-2.0。固定版本 ${revision}。本节由 X-SIA 选编并重新归类：补充承接说明，调整标题层级、图片路径和脚注前缀，保留选定推导及上游图号；图号和节号不是本卷的新编号。下文的配置、题设和作者报告不代表 X-SIA 已完成对应实测。\n\n${selection.bridge}\n\n${urls}\n\n${excerpts.join('\n\n')}\n\n### 原著许可与整理说明\n\n原创正文与图按原著 Apache-2.0 许可选编；未导入第三方论文、字体、模板或实验原始数据。完整许可如下，原图的固定来源与 SHA256 另存于教材源工程的 assets/third-party/ai-infra/sources.json。\n\n\`\`\`license\n${license.trimEnd()}\n\`\`\`\n\n${definitions.join('\n\n')}\n<!-- AI-INFRA-END -->\n\n`
  const target = path.join(root, 'content', `${selection.target}.md`)
  let content = await readFile(target, 'utf8')
  content = content.replace(/<!-- AI-INFRA-BEGIN -->[\s\S]*?<!-- AI-INFRA-END -->\n*/g, '')
  const marker = '## 练习与解题提示'
  if (!content.includes(marker)) throw Error(`No insertion point: ${target}`)
  pendingChapters.push({ target, content: content.replace(marker, () => block + marker) })
}
for (const image of images.values()) {
  const url = `https://raw.githubusercontent.com/bojieli/ai-infra-book/${revision}/${image.path}`
  const previous =
    archived?.revision === revision
      ? archived.images.find((item) => item.path === image.path)
      : null
  let svg
  if (previous) {
    svg = await readFile(path.join(destination, previous.file), 'utf8')
    if (hash(svg) !== previous.sha256) throw Error(`Archived original changed: ${image.path}`)
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw Error(`Image download failed: ${image.path}`)
    svg = await response.text()
  }
  if (
    svg.length > 1000000 ||
    !svg.includes('<svg') ||
    !svg.trimEnd().endsWith('</svg>') ||
    /<script|<foreignObject|<!ENTITY|\son\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:|data:|\/\/)|@import|url\(\s*["']?https?:/i.test(
      svg,
    )
  )
    throw Error(`Unsafe or invalid SVG: ${image.path}`)
  await writeFile(path.join(destination, image.file), svg)
  image.sha256 = hash(svg)
  image.sourceUrl = url
  image.modified = false
  console.log('Original SVG archived:', image.id)
}
await writeFile(
  path.join(destination, 'sources.json'),
  JSON.stringify(
    {
      repository: 'https://github.com/bojieli/ai-infra-book',
      revision,
      author: 'Bojie Li (李博杰)',
      copyright: 'Copyright 2026 Bojie Li',
      license: 'Apache-2.0',
      licenseSha256: hash(license),
      modifications:
        'Selected and reorganized manuscript sections; original SVG bytes unchanged; no upstream scripts executed',
      records,
      images: [...images.values()],
    },
    null,
    2,
  ),
)
for (const { target, content } of pendingChapters) await writeFile(target, content)
console.log(
  `Integrated ${records.length} source sections into ${selections.length} native chapters with ${images.size} original figures`,
)
