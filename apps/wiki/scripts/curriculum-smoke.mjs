import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { chapterExpectations } from '../../books/scripts/chapter-expectations.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(await readFile(path.join(root, '../books/catalog.json'), 'utf8'))
const expectedChapters = await chapterExpectations(catalog)
const origin = process.env.WIKI_TEST_ORIGIN || 'http://localhost:8787'
const url = new URL(origin)
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  !['http:', 'https:'].includes(url.protocol)
)
  throw new Error('Localhost targets only')
const output = path.resolve(root, '../../.local/wiki-curriculum')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  channel: process.env.WIKI_BROWSER_CHANNEL || 'msedge',
  headless: true,
})
const errors = [],
  checked = [],
  loads = []
async function setup(page) {
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/missing'))
      errors.push(`${response.status()}: ${response.url()}`)
  })
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url())
    loads.push(u.pathname)
    if (u.port === '8083' || u.pathname.startsWith('/books/')) {
      errors.push(`Independent book dependency: ${u}`)
      return route.abort()
    }
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      !['data:', 'blob:'].includes(u.protocol)
    ) {
      errors.push(`External resource: ${u.origin}`)
      return route.abort()
    }
    return route.continue()
  })
}
async function ready(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager'
    })
    await document.fonts.ready
    await Promise.all([...document.images].map((img) => img.decode()))
  })
  assert.equal(await page.locator('iframe').count(), 0)
  assert.equal(await page.locator('a[href^="/books/"]').count(), 0)
  assert.equal(await page.locator('.katex-error').count(), 0)
  const size = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  assert.ok(size.scroll <= size.width + 1, `Overflow ${page.url()}: ${JSON.stringify(size)}`)
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    await setup(page)
    assert.equal((await page.goto(`${origin}/wiki/`)).status(), 200)
    await ready(page)
    assert.equal(await page.locator('.curriculum-volume').count(), catalog.volumes.length)
    assert.equal(
      await page.locator('.curriculum-volume ol a').count(),
      catalog.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
    )
    await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true })
    await page.waitForFunction(() => document.documentElement.dataset.wikiHydrated === 'true')
    await page.evaluate(() => {
      window.__wikiNavigationMarker = 'same-document'
    })
    await page.locator('.curriculum-volume ol a').first().click()
    await page.waitForURL('**/wiki/learn/linux/process')
    assert.equal(await page.evaluate(() => window.__wikiNavigationMarker), 'same-document')
    await page.locator('article .katex').first().waitFor()
    await ready(page)
    await page.locator('.curriculum-pager a').last().click()
    await page.waitForURL('**/wiki/learn/linux/files')
    assert.equal(await page.evaluate(() => window.__wikiNavigationMarker), 'same-document')
    for (const volume of catalog.volumes) {
      assert.equal((await page.goto(`${origin}/wiki/learn/${volume.id}`)).status(), 200)
      assert.equal(await page.locator('.volume-chapters li').count(), volume.chapters.length)
      if (volume.parts) {
        assert.equal(await page.locator('.volume-part').count(), volume.parts.length)
        assert.equal(await page.locator('.volume-part-index a').count(), volume.parts.length)
      }
      for (const chapter of volume.chapters) {
        assert.equal(
          (await page.goto(`${origin}/wiki/learn/${volume.id}/${chapter.id}`)).status(),
          200,
        )
        await ready(page)
        assert.equal(await page.locator('h1').textContent(), chapter.title)
        if (volume.parts) {
          const part = volume.parts.find((part) => part.chapters.includes(chapter.id))
          assert.ok((await page.locator('.breadcrumbs').innerText()).includes(part.title))
        }
        assert.equal(
          await page.locator('article img').count(),
          expectedChapters.get(`${volume.id}/${chapter.id}`).figures.length,
        )
        assert.ok((await page.locator('article math').count()) > 0)
        assert.ok(
          await page
            .locator('article')
            .innerText()
            .then((text) => text.includes('练习与解题提示')),
        )
        const ids = await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id))
        assert.equal(new Set(ids).size, ids.length)
        const targets = await page
          .locator('.right-rail a[href^="#"], .curriculum-mobile-toc a[href^="#"]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href').slice(1)))
        for (const id of targets) assert.ok(ids.includes(id), `Missing anchor ${id}`)
        const footnotes = await page
          .locator('article a[href^="#"]')
          .evaluateAll((nodes) =>
            nodes.map((node) => decodeURIComponent(node.getAttribute('href').slice(1))),
          )
        for (const id of footnotes) assert.ok(ids.includes(id), `Missing article fragment ${id}`)
        const internal = await page
          .locator('article a[href^="/wiki/learn/"]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
        assert.ok(internal.every((href) => !href.endsWith('.html')))
        checked.push(`${width}:${volume.id}/${chapter.id}`)
        if (
          volume.id === 'linux' ||
          chapter.id === 'linear' ||
          chapter.id === 'boot' ||
          chapter.id === 'rust'
        )
          await page.screenshot({
            path: path.join(output, `${volume.id}-${chapter.id}-${width}.png`),
            // Bound raster memory for long chapters with third-party diagrams.
            fullPage: false,
          })
      }
      assert.equal((await page.goto(`${origin}/wiki/learn/${volume.id}/print`)).status(), 200)
      await ready(page)
      assert.equal(await page.locator('.curriculum-print-chapter').count(), volume.chapters.length)
      if (volume.parts) {
        assert.equal(await page.locator('.curriculum-print-part > h2').count(), volume.parts.length)
        assert.equal(
          await page.locator('.curriculum-print-chapter > h3').count(),
          volume.chapters.length,
        )
        assert.ok((await page.locator('.curriculum-print-chapter .markdown h4').count()) > 0)
      }
      assert.equal(
        await page.locator('.curriculum-print img').count(),
        volume.chapters.reduce(
          (total, chapter) =>
            total + expectedChapters.get(`${volume.id}/${chapter.id}`).figures.length,
          0,
        ),
      )
      const ids = await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id))
      assert.equal(new Set(ids).size, ids.length)
    }
    await page.goto(`${origin}/wiki/`)
    await page.getByLabel('搜索知识库').fill('页内偏移')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.waitForURL('**/wiki/?q=*')
    await page.locator('.textbook-results').waitFor()
    assert.ok(
      await page
        .locator('.textbook-results')
        .innerText()
        .then((text) => text.includes('虚拟内存与缓存层次')),
    )
    await page.goto(`${origin}/wiki/`)
    await page.waitForFunction(() => document.documentElement.dataset.wikiHydrated === 'true')
    await page.locator('.curriculum-index-part h4 a[href$="#part-compilation"]').click()
    await page.waitForURL('**/wiki/learn/linux#part-compilation')
    await page.locator('#part-compilation').waitFor()
    await page.goto(`${origin}/wiki/?q=${encodeURIComponent('流水线')}`)
    const pipelineResults = await page.locator('.textbook-results').innerText()
    assert.ok(pipelineResults.includes('CPU 流水线：数据通路、冒险与性能'))
    assert.ok(pipelineResults.includes('软件流水线：有界队列、背压与失败传播'))
    await page.goto(`${origin}/wiki/?category=${encodeURIComponent('Linux 与计算机系统')}`)
    assert.equal(await page.locator('.textbook-results > li').count(), 14)
    await page.goto(`${origin}/wiki/?category=${encodeURIComponent('嵌入式基础')}`)
    assert.equal(await page.locator('.textbook-results > li').count(), 4)
    await page.goto(`${origin}/wiki/paths`)
    await ready(page)
    assert.equal(await page.locator('main table').first().locator('tbody tr').count(), 11)
    assert.equal(await page.locator('#ai-infra-map tbody tr').count(), 12)
    assert.ok((await page.locator('main').innerText()).includes('尚未达到完整专业教材体量'))
    await page.goto(`${origin}/wiki/?q=NO_MATCH_8838`)
    assert.equal(await page.locator('.textbook-results > li').count(), 0)
    await context.close()
  }
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1200, height: 900 },
  })
  const page = await context.newPage()
  await setup(page)
  await page.goto(`${origin}/wiki/learn/math/linear`)
  await ready(page)
  assert.ok((await page.locator('math').count()) > 0)
  assert.equal(
    await page.locator('article img').count(),
    expectedChapters.get('math/linear').figures.length,
  )
  await page.goto(`${origin}/wiki/learn/math/print`)
  await page.emulateMedia({ media: 'print' })
  await ready(page)
  assert.equal(await page.locator('.site-header').isVisible(), false)
  assert.equal(await page.locator('.curriculum-sidebar').isVisible(), false)
  for (const route of [
    '/wiki/learn/missing',
    '/wiki/learn/math/missing',
    '/wiki/learn/missing/print',
  ]) {
    assert.equal((await page.goto(`${origin}${route}`)).status(), 404)
  }
  await context.close()
  assert.deepEqual(errors, [])
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        checked,
        originalBookRequests: loads.filter((p) => p.startsWith('/books/')).length,
        nativeNavigation: 'passed',
        search: 'passed',
        volumesAndPrint: 'passed',
        ssrWithoutJavaScript: 'passed',
        invalidPaths: '404',
        errors,
      },
      null,
      2,
    ),
  )
  console.log(
    `Wiki curriculum passed: ${checked.length} chapter/viewport combinations; native navigation, search, figures, math, print, SSR and 404`,
  )
} catch (error) {
  console.error(
    'Wiki browser diagnostics:',
    JSON.stringify({ errors, recentLoads: loads.slice(-15) }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
