import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { createFigures, writeFigures } from './figures.mjs'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
export const escapeHtml = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
const E = escapeHtml
function walk(node, fn) {
  fn(node)
  for (const child of node.children ?? []) walk(child, fn)
}
const nodeText = (node) => node.value ?? (node.children ?? []).map(nodeText).join('')
export function validateVolumeParts(volume) {
  if (!volume.parts) return
  if (!Array.isArray(volume.parts) || !volume.parts.length) throw new Error('Invalid parts')
  const ids = new Set()
  const ordered = []
  for (const part of volume.parts) {
    if (
      !/^[a-z-]+$/.test(part.id) ||
      ids.has(part.id) ||
      typeof part.title !== 'string' ||
      !part.title.trim() ||
      !Array.isArray(part.chapters) ||
      !part.chapters.length
    )
      throw new Error('Invalid parts')
    ids.add(part.id)
    ordered.push(...part.chapters)
  }
  if (
    new Set(ordered).size !== ordered.length ||
    ordered.join('|') !== volume.chapters.map((chapter) => chapter.id).join('|')
  )
    throw new Error('Invalid part membership or order')
}
export async function readCatalog() {
  const catalog = JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8'))
  const ids = new Set()
  const volumes = new Set()
  for (const v of catalog.volumes) {
    if (!/^[a-z-]+$/.test(v.id) || volumes.has(v.id) || !/^#[\da-f]{6}$/i.test(v.accent))
      throw new Error('Invalid volume metadata')
    volumes.add(v.id)
    validateVolumeParts(v)
    for (const c of v.chapters) {
      const id = `${v.id}/${c.id}`
      if (!/^[a-z-]+$/.test(c.id) || ids.has(id)) throw new Error(`Invalid chapter: ${id}`)
      ids.add(id)
    }
  }
  return { catalog, ids }
}
export async function renderMarkdown(
  source,
  { base = '../', chapterKey = 'test', ids, figures, printVolume } = {},
) {
  const toc = []
  let heading = 0,
    formulas = 0,
    images = 0,
    code = 0
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(() => (tree) => {
      tree.children = tree.children.filter((n) => !(n.type === 'heading' && n.depth === 1))
      walk(tree, (n) => {
        if (n.type === 'heading') {
          const id = `${chapterKey.replaceAll('/', '-')}-s${++heading}`
          n.data = { ...n.data, hProperties: { id } }
          toc.push({ id, title: nodeText(n), depth: n.depth })
          if (printVolume) n.depth = Math.min(n.depth + 1, 6)
        }
        if (n.type === 'math' || n.type === 'inlineMath') formulas++
        if (n.type === 'code') code++
        if (n.type === 'image') {
          if (!n.url.startsWith('asset:') || !n.alt?.trim())
            throw new Error('Images need a local asset id and meaningful alt text')
          const id = n.url.slice(6)
          if (!figures?.has(id)) throw new Error(`Missing figure: ${id}`)
          n.url = `${base}assets/figures/${id}.svg`
          images++
        }
        if (n.type === 'link') {
          if (n.url.startsWith('book:')) {
            const id = n.url.slice(5)
            if (!ids?.has(id)) throw new Error(`Unknown chapter link: ${id}`)
            n.url =
              printVolume && id.startsWith(`${printVolume}/`)
                ? `#chapter-${id.replaceAll('/', '-')}`
                : `${base}${id}.html`
          } else if (!/^https:\/\//i.test(n.url) && !/^#[\w-]+$/.test(n.url)) {
            throw new Error(`Unsupported link protocol in ${chapterKey}`)
          }
        }
      })
    })
    .use(remarkRehype, { clobberPrefix: `${chapterKey.replaceAll('/', '-')}-` })
    .use(() => (tree) => {
      const footnoteLabel = `${chapterKey.replaceAll('/', '-')}-footnote-label`
      walk(tree, (node) => {
        if (node.properties?.id === 'footnote-label') node.properties.id = footnoteLabel
        if (Array.isArray(node.properties?.ariaDescribedBy))
          node.properties.ariaDescribedBy = node.properties.ariaDescribedBy.map((id) =>
            id === 'footnote-label' ? footnoteLabel : id,
          )
      })
      function transform(parent) {
        if (!parent.children) return
        parent.children = parent.children.map((n) => {
          transform(n)
          if (n.type === 'element' && n.tagName === 'table')
            return {
              type: 'element',
              tagName: 'div',
              properties: {
                className: ['table-scroll'],
                tabIndex: 0,
                role: 'region',
                ariaLabel: '可横向滚动的表格',
              },
              children: [n],
            }
          if (
            n.type === 'element' &&
            n.tagName === 'p' &&
            n.children?.length === 1 &&
            n.children[0].tagName === 'img'
          ) {
            const img = n.children[0]
            img.properties.loading = 'lazy'
            img.properties.decoding = 'async'
            img.properties.width = 900
            img.properties.height = 360
            return {
              type: 'element',
              tagName: 'figure',
              properties: {},
              children: [
                {
                  type: 'element',
                  tagName: 'a',
                  properties: {
                    href: img.properties.src,
                    target: '_blank',
                    rel: ['noopener', 'noreferrer'],
                    ariaLabel: '查看技术图原尺寸',
                  },
                  children: [img],
                },
                {
                  type: 'element',
                  tagName: 'figcaption',
                  properties: {},
                  children: [{ type: 'text', value: img.properties.alt }],
                },
              ],
            }
          }
          return n
        })
      }
      transform(tree)
    })
    .use(rehypeKatex, { trust: false, strict: false, maxExpand: 1000, maxSize: 20 })
    .use(rehypeStringify)
  const output = await processor.process(source)
  if (output.messages.length)
    throw new Error(
      `Math rendering failed in ${chapterKey}: ${output.messages.map((m) => m.reason).join('; ')}`,
    )
  return { html: String(output), toc, formulas, images, code }
}
function tocHtml(toc) {
  return `<ol class="chapter-toc">${toc.map((h) => `<li class="depth-${h.depth}"><a href="#${E(h.id)}">${E(h.title)}</a></li>`).join('')}</ol>`
}
function volumeNav(catalog, current, base) {
  return `<nav aria-label="分卷目录" class="volume-nav">${catalog.volumes.map((v) => `<details${current?.startsWith(`${v.id}/`) ? ' open' : ''}><summary><span>${E(v.number)}</span> ${E(v.title)}</summary><ol>${v.chapters.map((c, i) => `<li><a href="${base}${v.id}/${c.id}.html"${current === `${v.id}/${c.id}` ? ' aria-current="page"' : ''}><span>${i + 1}.</span> ${E(c.title)}</a></li>`).join('')}<li><a class="print-link" href="${base}${v.id}/print.html">整卷阅读 / 打印</a></li></ol></details>`).join('')}</nav>`
}
function page(catalog, { title, base, main, aside = '', current, print = false }) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="工程基础丛书：有推导、图解、例题与练习的基础与语言篇。本地编辑预览。"><title>${E(title)} · ${E(catalog.title)}</title><link rel="stylesheet" href="${base}assets/katex/katex.min.css"><link rel="stylesheet" href="${base}assets/book.css"></head><body data-base="${base}" data-chapters="${catalog.volumes.reduce((n, v) => n + v.chapters.length, 0)}" class="${print ? 'print-volume' : ''}"><a class="skip" href="#main">跳到正文</a><header class="site-header"><a class="brand" href="${base}index.html">X–SIA <span>工程基础丛书</span></a><nav aria-label="阅读工具"><button type="button" id="nav-toggle" aria-expanded="false" aria-controls="book-navigation" hidden>目录</button><a href="${base}index.html#search">检索</a><a href="${base}downloads.html">PDF</a><button type="button" id="theme" aria-label="切换明暗主题" hidden>明暗</button><button type="button" id="print" hidden>打印 / PDF</button></nav></header><div class="edition-bar">${E(catalog.edition)} <span>本地编辑预览 · 非公开发行版</span></div><div class="book-layout"><aside class="book-nav" id="book-navigation"><a class="contents-link" href="${base}index.html">总目与阅读路径</a>${volumeNav(catalog, current, base)}<p class="editorial-note">正文为编辑草案。算例、构建与硬件验证分开记录；命令不会随页面执行。</p></aside><main id="main">${main}</main><aside class="page-toc" aria-label="本页目录">${aside}</aside></div><footer>以机制连接知识，以证据检查理解。<span>字体、公式和插图均随本地构建提供；不请求外部 CDN。</span></footer><script src="${base}assets/reader.js" defer></script></body></html>`
}
export async function build(output = path.join(root, 'dist')) {
  const { catalog, ids } = await readCatalog()
  const { figs } = createFigures()
  const sourceHash = createHash('sha256')
  for (const file of [
    'catalog.json',
    'assets/book.css',
    'assets/reader.js',
    'scripts/build.mjs',
    'scripts/figures.mjs',
    'scripts/export-pdf.mjs',
    'package.json',
    '../../pnpm-lock.yaml',
  ]) {
    sourceHash
      .update(file)
      .update('\0')
      .update(await readFile(path.join(root, file)))
      .update('\0')
  }
  for (const [id, svg] of figs) sourceHash.update(id).update('\0').update(svg).update('\0')
  await mkdir(output, { recursive: true })
  await writeFigures(path.join(root, 'assets'))
  await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true })
  const katexRoot = path.dirname(require.resolve('katex/package.json'))
  await mkdir(path.join(output, 'assets/katex'), { recursive: true })
  await cp(
    path.join(katexRoot, 'dist/katex.min.css'),
    path.join(output, 'assets/katex/katex.min.css'),
  )
  await cp(path.join(katexRoot, 'dist/fonts'), path.join(output, 'assets/katex/fonts'), {
    recursive: true,
  })
  const search = [],
    metrics = [],
    all = catalog.volumes.flatMap((v) => v.chapters.map((c) => ({ v, c, key: `${v.id}/${c.id}` })))
  for (const v of catalog.volumes) {
    const combined = [],
      printToc = []
    await mkdir(path.join(output, v.id), { recursive: true })
    for (const [index, c] of v.chapters.entries()) {
      const key = `${v.id}/${c.id}`
      const source = await readFile(path.join(root, 'content', `${key}.md`), 'utf8')
      sourceHash.update(key).update('\0').update(source).update('\0')
      if (!source.startsWith(`# ${c.title}\n`)) throw new Error(`Title mismatch: ${key}`)
      for (const marker of ['先修', '目标', '## 练习与解题提示', '## 小结与参考'])
        if (!source.includes(marker)) throw new Error(`Missing ${marker}: ${key}`)
      const rendered = await renderMarkdown(source, { ids, figures: figs, chapterKey: key })
      if (!rendered.images || !rendered.formulas || rendered.toc.length < 7)
        throw new Error(`Incomplete chapter structure: ${key}`)
      const han = (source.match(/\p{Script=Han}/gu) ?? []).length
      const minutes = Math.max(8, Math.ceil(han / 180))
      const position = all.findIndex((x) => x.key === key)
      const navLink = (item, label) =>
        item
          ? `<a href="../${item.key}.html"><small>${label} · ${E(item.v.title)}</small>${E(item.c.title)} <span aria-hidden="true">→</span></a>`
          : '<span></span>'
      const main = `<div class="breadcrumb"><a href="../index.html">丛书</a> / 卷 ${v.number} · ${E(v.title)}</div><p class="eyebrow">CHAPTER ${String(index + 1).padStart(2, '0')}</p><h1>${E(c.title)}</h1><p class="chapter-lead">${E(c.summary)}</p><div class="chapter-meta">${han.toLocaleString('zh-CN')} 个汉字 · 阅读约 ${minutes} 分钟（不含练习） · 编辑草案<a href="print.html">整卷阅读</a></div><details class="mobile-toc"><summary>本章目录</summary>${tocHtml(rendered.toc)}</details><article class="prose">${rendered.html}</article><nav class="chapter-pager" aria-label="上下章">${navLink(all[position - 1], '上一章')}${navLink(all[position + 1], '下一章')}</nav>`
      await writeFile(
        path.join(output, `${key}.html`),
        page(catalog, {
          title: c.title,
          base: '../',
          main,
          current: key,
          aside: `<p class="eyebrow">本章目录</p>${tocHtml(rendered.toc)}`,
        }),
      )
      const printRendered = await renderMarkdown(source, {
        ids,
        figures: figs,
        chapterKey: key,
        printVolume: v.id,
      })
      const chapterId = `chapter-${key.replaceAll('/', '-')}`
      combined.push(
        `<section class="print-chapter" id="${chapterId}"><p class="eyebrow">第 ${index + 1} 章</p><h2 class="print-chapter-title">${E(c.title)}</h2><article class="prose">${printRendered.html}</article></section>`,
      )
      printToc.push({ id: chapterId, title: c.title, depth: 2 })
      const plain = source
        .replace(/!\[[\s\S]*?\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#>*`]/g, '')
        .replace(/\s+/g, ' ')
      search.push({ title: c.title, volume: v.title, url: `${key}.html`, text: plain })
      metrics.push({
        id: key,
        han,
        sourceCharacters: source.length,
        formulas: rendered.formulas,
        figures: rendered.images,
        codeBlocks: rendered.code,
        sections: rendered.toc.length,
      })
    }
    await writeFile(
      path.join(output, v.id, 'print.html'),
      page(catalog, {
        title: `${v.title} · 整卷`,
        base: '../',
        print: true,
        current: `${v.id}/print`,
        main: `<p class="eyebrow">VOLUME ${v.number}</p><h1>${E(v.title)}</h1><p class="chapter-lead">${E(v.description)}</p><p>先修：${E(v.prerequisites)}</p><p class="notice">整卷编辑草案。可使用浏览器打印保存 PDF；浏览器页码与字体可能影响分页。未进行硬件验收。</p>${tocHtml(printToc)}${combined.join('')}`,
        aside: `<p class="eyebrow">卷内目录</p>${tocHtml(printToc)}`,
      }),
    )
  }
  const totalHan = metrics.reduce((a, m) => a + m.han, 0)
  const cards = catalog.volumes
    .map(
      (v) =>
        `<section class="volume-card" style="--accent:${v.accent}"><p class="eyebrow">VOLUME ${v.number}</p><h2><a href="${v.id}/${v.chapters[0].id}.html">${E(v.title)}</a></h2><p>${E(v.description)}</p><ol>${v.chapters.map((c, i) => `<li><a href="${v.id}/${c.id}.html"><span>${String(i + 1).padStart(2, '0')}</span>${E(c.title)}</a></li>`).join('')}</ol><a class="volume-print" href="${v.id}/print.html">整卷阅读与打印 →</a></section>`,
    )
    .join('')
  const home = `<p class="eyebrow">X–SIA / ENGINEERING LIBRARY</p><h1>${E(catalog.title)}</h1><p class="chapter-lead">${E(catalog.subtitle)}。不是术语速查表，而是连接概念、机制、推导与实践的基础教材。</p><img class="cover" src="assets/cover.svg" width="900" height="360" alt="原创矢量概念封面：从工具到机制，从公式到工程。"><div class="book-stats"><span><strong>${catalog.volumes.length}</strong> 卷</span><span><strong>${metrics.length}</strong> 章正文</span><span><strong>${figs.size}</strong> 幅技术图</span><span><strong>${(totalHan / 10000).toFixed(1)}</strong> 万汉字</span></div><section class="reading-path"><h2>如何开始阅读</h2><p><strong>开发路线：</strong>Linux → 服务器；<strong>硬件路线：</strong>Linux 工具 → 嵌入式 → 计算机系统；数学卷按需要交叉阅读。正文中的公式均给出含义和条件，图示与确定性算例相互对应。</p><p class="muted">当前版本是基础与语言篇编辑稿，不是完整本科课程的终版。硬件步骤、真实 Linux 环境与生产部署仍需独立验证。页面内代码仅展示，不会执行。</p></section><section id="search" class="search-panel"><h2>检索全书</h2><label for="book-search">输入概念、命令或问题（支持中文子串）</label><input id="book-search" type="search" maxlength="100" placeholder="例如：页内偏移、最小二乘、SSH、采样…" aria-controls="search-results"><p id="search-status" role="status" aria-live="polite">启用 JavaScript 后可检索全文；目录与正文无需 JavaScript。</p><ul id="search-results"></ul></section><div class="volume-grid">${cards}</div><section class="editorial"><h2>本版的编辑方式</h2><p>以既有知识框架选择问题，重新组织解释与推导。每章包含先修、目标、机制、图解、例题、练习、解题提示和公开参考资料。技术图含原创图解和按 MIT 许可转载的 Rust 官方教材原图，出处及许可随对应章节保留。</p><p>参考资料用于进一步核对；不会随打开页面自动请求外站。未逐章技术审校，欢迎在 Markdown 源文件中持续修订。没有从私人笔记导入账号、凭据或研究结果。</p></section>`
  await writeFile(
    path.join(output, 'index.html'),
    page(catalog, { title: '总目与阅读路径', base: './', main: home }),
  )
  await writeFile(path.join(output, 'search-index.json'), JSON.stringify(search))
  const sourceSha256 = sourceHash.digest('hex')
  const report = {
    sourceSha256,
    edition: catalog.edition,
    chapters: metrics.length,
    volumes: catalog.volumes.length,
    technicalFigures: figs.size,
    totalHan,
    formulas: metrics.reduce((a, m) => a + m.formulas, 0),
    metrics,
  }
  await writeFile(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2))
  const available = []
  try {
    const manifest = JSON.parse(await readFile(path.join(output, 'exports/manifest.json'), 'utf8'))
    if (manifest.sourceSha256 === sourceSha256) {
      for (const v of catalog.volumes) {
        const entry = manifest.exports.find(
          (item) => item.volume === v.id && item.file === `${v.id}.pdf`,
        )
        if (entry && (await stat(path.join(output, 'exports', entry.file))).isFile()) {
          const actual = createHash('sha256')
            .update(await readFile(path.join(output, 'exports', entry.file)))
            .digest('hex')
          if (actual === entry.sha256) available.push({ ...entry, title: v.title })
        }
      }
    }
  } catch {
    /* No matching PDF edition yet; HTML reading remains available. */
  }
  const downloads = `<p class="eyebrow">LOCAL EDITION / PDF</p><h1>分卷 PDF</h1><p class="chapter-lead">与当前正文和排版源文件匹配、且通过 SHA256 校验的本地导出。</p>${available.length ? `<ul>${available.map((item) => `<li><a href="exports/${item.file}" download>${E(item.title)} · PDF</a> <span class="muted">${(item.bytes / 1024).toFixed(0)} KiB</span></li>`).join('')}</ul><p><a href="exports/manifest.json">导出清单与校验值</a></p>` : '<p class="notice">当前还没有匹配本版源文件的 PDF，或正文已经更新。请在仓库根目录运行 <code>pnpm books:pdf</code> 重新导出。</p>'}<p>PDF 为编辑草案。浏览器排版已生成，不代表完成逐页出版审校。也可进入整卷阅读，使用浏览器打印。</p><p><a href="index.html">返回总目 →</a></p>`
  await writeFile(
    path.join(output, 'downloads.html'),
    page(catalog, { title: '分卷 PDF', base: './', main: downloads }),
  )
  console.log(
    `Books built: ${report.volumes} volumes / ${report.chapters} chapters / ${report.totalHan} Han characters / ${report.formulas} formulas / ${report.technicalFigures} figures`,
  )
  return report
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await build()
