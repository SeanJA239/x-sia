import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { readCatalog, root } from './build.mjs'
import { chapterExpectations } from './chapter-expectations.mjs'

const origin = process.env.BOOKS_TEST_ORIGIN || 'http://localhost:8787'
const parsed = new URL(origin)
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
  !['http:', 'https:'].includes(parsed.protocol)
)
  throw new Error('Localhost-only browser test')
const output = path.resolve(root, '../../.local/books-preview')
await mkdir(output, { recursive: true })
const { catalog } = await readCatalog()
const expectedChapters = await chapterExpectations(catalog)
const browser = await chromium.launch({
  channel: process.env.BOOKS_BROWSER_CHANNEL || 'msedge',
  headless: true,
})
const errors = [],
  checked = [],
  figureIssues = []
async function prepare(page) {
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol !== 'file:') {
      errors.push(`External load: ${url.origin}`)
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
  assert.equal(await page.locator('.katex-error').count(), 0)
  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }))
  assert.ok(
    overflow.width <= overflow.viewport + 1,
    `Overflow ${page.url()}: ${JSON.stringify(overflow)}`,
  )
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    await prepare(page)
    assert.equal((await page.goto(`${origin}/books/`)).status(), 200)
    await ready(page)
    assert.equal(await page.locator('.volume-card').count(), catalog.volumes.length)
    await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true })
    await page.locator('#book-search').fill('页内偏移')
    await page.waitForFunction(() =>
      document.querySelector('#search-status').textContent.startsWith('找到'),
    )
    assert.ok((await page.locator('#search-results a').count()) >= 1)
    await page.locator('#search-results a').first().click()
    assert.ok(page.url().includes('/systems/memory.html'))
    await page.locator('#theme').click()
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
    await page.locator('#theme').click()
    if (width === 390) {
      await page.locator('#nav-toggle').click()
      assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'), 'true')
      await page.locator('#nav-toggle').click()
    }
    for (const v of catalog.volumes)
      for (const c of v.chapters) {
        assert.equal((await page.goto(`${origin}/books/${v.id}/${c.id}.html`)).status(), 200)
        await ready(page)
        assert.equal(await page.locator('h1').textContent(), c.title)
        assert.equal(
          await page.locator('article figure').count(),
          expectedChapters.get(`${v.id}/${c.id}`).figures.length,
        )
        assert.ok((await page.locator('article .katex').count()) > 0)
        assert.ok((await page.locator('math').count()) > 0)
        if (width === 1440 && c.id !== 'rust') {
          const issues = await page.evaluate(async () => {
            const img = document.querySelector('article figure img')
            const markup = await (await fetch(img.src)).text()
            const holder = document.createElement('div')
            holder.style.cssText = 'position:fixed;left:-10000px;width:900px;top:0;'
            // Only generated same-origin SVG is used in this test, never reader input.
            holder.innerHTML = markup
            document.body.append(holder)
            const bad = [...holder.querySelectorAll('text')]
              .filter((t) => {
                const b = t.getBBox()
                return b.x < -1 || b.y < -1 || b.x + b.width > 901 || b.y + b.height > 361
              })
              .map((t) => t.textContent)
            holder.remove()
            return bad
          })
          figureIssues.push(...issues.map((text) => `${v.id}/${c.id}: ${text}`))
        }
        checked.push(`${width}:${v.id}/${c.id}`)
        if (['linear', 'boot', 'signals'].includes(c.id)) {
          await page.screenshot({
            path: path.join(output, `${v.id}-${c.id}-${width}.png`),
            fullPage: false,
          })
          if (width === 1440)
            await page
              .locator('article figure')
              .first()
              .screenshot({ path: path.join(output, `${v.id}-${c.id}-figure.png`) })
        }
      }
    await page.goto(`${origin}/books/math/print.html`)
    await page.emulateMedia({ media: 'print' })
    await ready(page)
    assert.equal(await page.locator('.print-chapter').count(), 4)
    await page.screenshot({ path: path.join(output, `math-print-${width}.png`) })
    await context.close()
  }
  const offline = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1200, height: 900 },
  })
  const page = await offline.newPage()
  await prepare(page)
  await page.goto(pathToFileURL(path.join(root, 'dist/math/linear.html')).href)
  await ready(page)
  assert.ok((await page.locator('math').count()) > 0)
  assert.equal(
    await page.locator('article figure img').count(),
    expectedChapters.get('math/linear').figures.length,
  )
  await page.locator('.chapter-pager a').last().click()
  assert.ok(page.url().endsWith('/math/calculus.html'))
  await offline.close()
  if (parsed.port === '8787') {
    const page = await browser.newPage()
    await prepare(page)
    await page.goto(`${origin}/wiki/`)
    assert.equal(await page.locator('a[href^="/books/"]').count(), 0)
    await page.locator('.curriculum-volume ol a').first().click()
    await page.waitForURL('**/wiki/learn/linux/process')
    await page.locator('article math').first().waitFor()
    await page.close()
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(figureIssues, [])
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        checked,
        javaScriptDisabledOffline: 'passed',
        search: 'passed',
        theme: 'passed',
        printLayout: 'passed',
        figureTextBounds: 'passed',
        errors,
        figureIssues,
      },
      null,
      2,
    ),
  )
  console.log(
    `Browser checks passed: ${checked.length} chapter/viewport combinations, offline, search, theme, print, SVG bounds`,
  )
} finally {
  await browser.close()
}
