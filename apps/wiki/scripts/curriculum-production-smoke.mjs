import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { chapterExpectations } from '../../books/scripts/chapter-expectations.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(await readFile(path.join(root, '../books/catalog.json'), 'utf8'))
const expectedChapters = await chapterExpectations(catalog)
const output = path.resolve(root, '../../.local/wiki-curriculum')
await mkdir(output, { recursive: true })
const unavailableApi = http.createServer((_req, res) => {
  res.writeHead(503)
  res.end('unavailable')
})
await new Promise((resolve) => unavailableApi.listen(0, '127.0.0.1', resolve))
const reservation = http.createServer()
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise((resolve) => reservation.close(resolve))
const child = spawn(
  process.execPath,
  ['node_modules/@react-router/serve/bin.cjs', 'build/server/index.js'],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_OPTIONS: '',
      HOST: '127.0.0.1',
      PORT: String(port),
      WIKI_API_ORIGIN: `http://127.0.0.1:${unavailableApi.address().port}`,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  },
)
let logs = '',
  browser
child.stdout.on('data', (data) => {
  logs = `${logs}${data}`.slice(-8000)
})
child.stderr.on('data', (data) => {
  logs = `${logs}${data}`.slice(-8000)
})
child.stdin.on('error', () => {})
const closed = new Promise((resolve) => child.on('exit', resolve))
const origin = `http://127.0.0.1:${port}`
const failures = []
try {
  let up = false
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Production server exited: ${logs}`)
    try {
      if ((await fetch(`${origin}/wiki/learn/math/linear`)).status === 200) {
        up = true
        break
      }
    } catch {
      /* bounded readiness poll */
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok(up, logs)
  browser = await chromium.launch({
    channel: process.env.WIKI_BROWSER_CHANNEL || 'msedge',
    headless: true,
  })
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()}: ${response.url()}`)
  })
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) {
      failures.push(`Unexpected dependency: ${url.origin}`)
      return route.abort()
    }
    return route.continue()
  })
  assert.equal((await page.goto(`${origin}/wiki/`)).status(), 200)
  assert.equal(await page.locator('.curriculum-volume').count(), catalog.volumes.length)
  assert.ok((await page.locator('.community-section').innerText()).includes('暂时不可用'))
  for (const route of [
    'math/linear',
    'servers/network',
    'math/signals',
    'math/probability',
    'servers/capacity',
    ...catalog.volumes
      .find((volume) => volume.id === 'linux')
      .chapters.map((chapter) => `linux/${chapter.id}`),
    'embedded/boot',
    'languages/rust',
  ]) {
    assert.equal((await page.goto(`${origin}/wiki/learn/${route}`)).status(), 200)
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((img) => {
        img.loading = 'eager'
      })
      await document.fonts.ready
      await Promise.all([...document.images].map((img) => img.decode()))
    })
    assert.equal(
      await page.locator('article img').count(),
      expectedChapters.get(route).figures.length,
    )
    assert.ok((await page.locator('article math').count()) > 0)
    assert.equal(await page.locator('a[href^="/books/"]').count(), 0)
  }
  assert.deepEqual(failures, [])
  await writeFile(
    path.join(output, 'production-report.json'),
    JSON.stringify(
      {
        productionBuild: 'passed',
        apiUnavailableFallback: 'passed',
        ssrNoJavaScript: 'passed',
        bundledFiguresAndFonts: 'passed',
        independentBookDependencies: 0,
        failures,
      },
      null,
      2,
    ),
  )
  console.log(
    'Production Wiki passed: native curriculum, API outage fallback, bundled fonts/figures and JS-disabled SSR',
  )
} finally {
  await browser?.close()
  child.kill('SIGTERM')
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 3000))])
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await new Promise((resolve) => unavailableApi.close(resolve))
}
