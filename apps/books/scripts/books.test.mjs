import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { before, test } from 'node:test'
import { build, readCatalog, renderMarkdown, root, validateVolumeParts } from './build.mjs'
import { createFigures } from './figures.mjs'
import { createServer } from './serve.mjs'

let metadata, report
const { figs } = createFigures()
before(async () => {
  metadata = await readCatalog()
  report = await build()
})
const render = (text, options = {}) =>
  renderMarkdown(text, { ids: metadata.ids, figures: figs, ...options })

test('Six modules and thirty-six substantial, structured chapters', () => {
  assert.equal(metadata.catalog.volumes.length, 6)
  assert.equal(metadata.ids.size, 36)
  assert.equal(report.chapters, 36)
  for (const chapter of report.metrics) {
    assert.ok(chapter.han > 900, `${chapter.id} needs prose`)
    assert.ok(chapter.sections >= 7)
    assert.ok(chapter.formulas >= 1)
    assert.ok(chapter.figures >= 1)
    if (['linux/process', 'linux/files', 'linux/shell', 'linux/observe'].includes(chapter.id)) {
      assert.ok(chapter.han >= 4000, `${chapter.id}: deepened prose regression`)
      assert.ok(chapter.figures >= 2, `${chapter.id}: explanatory figures regression`)
    }
  }
})
test('Linux has seven nonempty parts covering fourteen chapters exactly once in reading order', () => {
  const linux = metadata.catalog.volumes.find((volume) => volume.id === 'linux')
  assert.equal(linux.parts.length, 7)
  assert.equal(linux.chapters.length, 14)
  validateVolumeParts(linux)
  for (const mutate of [
    (volume) => volume.parts[0].chapters.push('unknown'),
    (volume) => volume.parts[0].chapters.pop(),
    (volume) => volume.parts[1].chapters.push(volume.parts[0].chapters[0]),
    (volume) => volume.parts[0].chapters.reverse(),
    (volume) => (volume.parts[0].chapters = []),
  ]) {
    const invalid = structuredClone(linux)
    mutate(invalid)
    assert.throws(() => validateVolumeParts(invalid), /Invalid part/)
  }
})
test('Math is rendered at build time with accessible MathML', async () => {
  const result = await render('# Test\n\n$$\n\\frac{1}{1-\\rho}\n$$\n')
  assert.match(result.html, /class="katex"/)
  assert.match(result.html, /<math/)
  assert.doesNotMatch(result.html, /katex-error/)
  assert.equal(result.formulas, 1)
})
test('Malformed formulas fail the build instead of silently displaying broken math', async () => {
  await assert.rejects(render('$$\n\\frac{1}{\n$$'), /Math rendering failed/)
})
test('Raw HTML and scripts are not executed or passed through', async () => {
  const result = await render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nText')
  assert.doesNotMatch(result.html, /<script|onerror|<img/)
  assert.match(result.html, /Text/)
})
test('External images and dangerous link protocols are rejected', async () => {
  await assert.rejects(render('![external](https://example.com/x.png)'), /local asset/)
  await assert.rejects(render('[bad](javascript:alert)'), /Unsupported link/)
  await assert.rejects(render('![missing](asset:unknown)'), /Missing figure/)
})
test('Chapter cross-links are validated and whole-volume links resolve internally', async () => {
  const normal = await render('[Read](book:linux/files)')
  assert.match(normal.html, /href="\.\.\/linux\/files.html"/)
  const print = await render('[Read](book:linux/files)', { printVolume: 'linux' })
  assert.match(print.html, /href="#chapter-linux-files"/)
  await assert.rejects(render('[bad](book:missing/page)'), /Unknown chapter/)
})
test('Footnotes and accessible labels stay unique across concatenated chapters', async () => {
  const body = 'Text[^x]\n\n[^x]: A source note.'
  const a = await render(body, { chapterKey: 'linux/a' })
  const b = await render(body, { chapterKey: 'linux/b' })
  const html = a.html + b.html
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('linux-a-footnote-label'))
  assert.ok(ids.includes('linux-b-footnote-label'))
})
test('Repeated headings receive unique deterministic anchors', async () => {
  const result = await render('## Same\n\nA\n\n## Same\n\nB', { chapterKey: 'linux/test' })
  assert.deepEqual(
    result.toc.map((h) => h.id),
    ['linux-test-s1', 'linux-test-s2'],
  )
})
test('All generated local links, fragments, images, scripts and styles exist', async () => {
  const dir = path.join(root, 'dist')
  const files = ['index.html', 'downloads.html']
  for (const v of metadata.catalog.volumes)
    for (const name of await readdir(path.join(dir, v.id)))
      if (name.endsWith('.html')) files.push(`${v.id}/${name}`)
  assert.equal(files.length, metadata.ids.size + metadata.catalog.volumes.length + 2)
  for (const file of files) {
    const html = await readFile(path.join(dir, file), 'utf8')
    const ids = [...html.matchAll(/<[a-zA-Z][^>]*?\bid="([^"]+)"/g)].map((m) => m[1])
    assert.equal(new Set(ids).size, ids.length, `Duplicate id: ${file}`)
    for (const match of html.matchAll(/<(?:a|link|script|img)\b[^>]*?\b(?:href|src)="([^"]+)"/g)) {
      const target = match[1]
      if (target.startsWith('https://')) continue
      assert.ok(!/^(?:http:|data:|javascript:)/i.test(target), target)
      const [relative, fragment] = target.split('#')
      const resolved = relative
        ? path.resolve(dir, path.dirname(file), relative)
        : path.join(dir, file)
      assert.ok(resolved.startsWith(dir + path.sep), target)
      assert.ok((await stat(resolved)).isFile(), `${file}: ${target}`)
      if (fragment)
        assert.ok(
          (await readFile(resolved, 'utf8')).includes(`id="${fragment}"`),
          `${file}: missing ${fragment}`,
        )
    }
  }
})
test('Search index includes all chapters and no private Notion content pointers', async () => {
  const raw = await readFile(path.join(root, 'dist/search-index.json'), 'utf8')
  const index = JSON.parse(raw)
  assert.equal(index.length, metadata.ids.size)
  assert.ok(index.some((x) => x.text.includes('正规方程')))
  assert.ok(index.some((x) => x.text.includes('页内偏移')))
  assert.doesNotMatch(raw, /app\.notion\.com|X-Amz-|PRIVATE KEY|Bearer /)
})
test('Original SVGs are accessible and licensed originals have no active external resources', () => {
  assert.equal(figs.size, 66)
  for (const [id, svg] of figs) {
    if (!id.startsWith('rust-string-') && !id.startsWith('aib-')) {
      assert.match(svg, /<title id="title">/)
      assert.match(svg, /<desc id="desc">/)
    }
    assert.doesNotMatch(
      svg,
      /<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:|\/\/)/i,
    )
    assert.ok(svg.length > 500, id)
  }
})
const approx = (actual, expected, epsilon = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`)
test('Deterministic worked answers: resources, networks, storage and timing', () => {
  approx(25 / 10, 2.5)
  assert.equal(0o666 & ~0o027, 0o640)
  assert.equal(0o777 & ~0o027, 0o750)
  approx((1e8 * 0.04) / 8, 500000)
  approx(1e12 / 1e8 / 3600, 2.7777777777777777)
  approx(1 / (100 - 95), 0.2)
  approx(84e6 / (84 * 1000), 1000)
  approx(256 / (12000 - 10000), 0.128)
  approx(115200 / 10, 11520)
  approx((24 * 10) / 9600, 0.025)
})
test('Deterministic worked answers: memory, pipeline and Amdahl', () => {
  assert.equal(0x12345 >> 12, 0x12)
  assert.equal(0x12345 & 0xfff, 0x345)
  assert.equal((0x9a << 12) + 0x345, 0x9a345)
  assert.equal(32768 / (8 * 64), 64)
  approx(1 + 0.05 * 80, 5)
  assert.equal(100 + 5 - 1, 104)
  approx(1 / (0.2 + 0.8 / 4), 2.5)
})
test('Deterministic worked answers: least squares and Euler', () => {
  const intercept = 7 / 6,
    slope = 0.5,
    y = [1, 2, 2]
  const residuals = y.map((v, i) => v - intercept - slope * i)
  approx(
    residuals.reduce((a, b) => a + b, 0),
    0,
  )
  approx(
    residuals.reduce((a, b, i) => a + b * i, 0),
    0,
  )
  approx(
    residuals.reduce((a, b) => a + b * b, 0),
    1 / 6,
  )
  assert.deepEqual(
    Array.from({ length: 5 }, (_, k) => (1 - 0.5) ** k),
    [1, 0.5, 0.25, 0.125, 0.0625],
  )
  approx(0.5 * (0.5 + 0.25), 0.375)
})
test('Deterministic worked answers: Bayes, fusion, RC and convolution', () => {
  approx(0.009 / (0.009 + 0.0495), 2 / 13)
  approx((1 * 4) / (1 + 4), 0.8)
  approx(1 / (2 * Math.PI * 0.001), 159.15494309189535)
  const convolve = (a, b) => {
    const y = Array(a.length + b.length - 1).fill(0)
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) y[i + j] += a[i] * b[j]
    return y
  }
  assert.deepEqual(convolve([1, 2], [1, 1]), [1, 3, 2])
  assert.deepEqual(convolve([1, 1, 1], [1, -1]), [1, 0, 0, -1])
  for (let n = 0; n < 10; n++)
    approx(Math.cos(2 * Math.PI * 0.3 * n), Math.cos(2 * Math.PI * 0.7 * n))
})
test('Local preview only serves built files, rejects traversal and writes', async () => {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  function request(route, method = 'GET', host = `127.0.0.1:${port}`) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: route, method, headers: { Host: host } },
        (res) => {
          res.resume()
          res.on('end', () => resolve(res))
        },
      )
      req.on('error', reject)
      req.end()
    })
  }
  try {
    assert.equal((await request('/books/')).statusCode, 200)
    assert.equal((await request('/books/math/linear.html', 'HEAD')).statusCode, 200)
    assert.equal((await request('/books/%2e%2e/catalog.json')).statusCode, 400)
    assert.equal((await request('/books/..%5cpackage.json')).statusCode, 400)
    assert.equal((await request('/books/%ZZ')).statusCode, 400)
    assert.equal((await request('/books/content/linux/files.md')).statusCode, 404)
    assert.equal((await request('/books/', 'POST')).statusCode, 405)
    assert.equal((await request('/books/', 'GET', 'evil.example')).statusCode, 403)
    assert.match(
      (await request('/books/')).headers['content-security-policy'],
      /default-src 'none'/,
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
