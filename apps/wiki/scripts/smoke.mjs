// Browser integration test against an explicitly local, already-running gateway.
// Credentials are environment-only. No tokens, passwords or request bodies are logged.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.env.WIKI_BASE_URL ?? 'http://localhost:8787'
const origin = new URL(base)
assert(
  ['localhost', '127.0.0.1'].includes(origin.hostname),
  'Smoke tests may only target localhost',
)
assert(
  process.env.WIKI_TEST_EMAIL && process.env.WIKI_TEST_PASSWORD,
  'Set WIKI_TEST_EMAIL and WIKI_TEST_PASSWORD to a local admin test account',
)
const output = fileURLToPath(new URL('../../../.local/wiki-smoke/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  channel: process.env.WIKI_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
})
const errors = []
let token, pageId, currentVersion, debugPage
const slug = `smoke-${Date.now()}`
async function request(path, method = 'GET', body) {
  return fetch(`${base}/api/v1/wiki${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  debugPage = page
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/wiki/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('邮箱', { exact: true }).fill(process.env.WIKI_TEST_EMAIL)
  await page.getByLabel('密码', { exact: true }).fill(process.env.WIKI_TEST_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/wiki/manage')
  await page.getByRole('link', { name: '新建 / 导入条目' }).click()
  await page.getByLabel('固定地址 Slug').fill(slug)
  await page.locator('summary').filter({ hasText: '从本地文件导入正文' }).click()
  const original = `# Wiki 联调测试\n\n仅用于本地模块验证。\n\n## 使用步骤\n\n${slug}\n\n中文检索测试。\n\n\`\`\`sh\necho wiki\n\`\`\`\n`
  await page
    .getByLabel('选择文档')
    .setInputFiles({ name: 'smoke.md', mimeType: 'text/markdown', buffer: Buffer.from(original) })
  await page.getByText('文件已载入编辑器，尚未保存或发布。').waitFor()
  await page.getByLabel('分类', { exact: true }).fill('模块联调')
  assert.equal((await fetch(`${base}/api/v1/wiki/pages/${slug}`)).status, 404)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.waitForURL('**/wiki/edit/*')
  pageId = new URL(page.url()).pathname.split('/').pop()
  token = await page.evaluate(() => localStorage.getItem('x-sia:token'))
  await page.getByRole('button', { name: '发布已保存草稿' }).waitFor()
  assert.equal((await fetch(`${base}/api/v1/wiki/pages/${slug}`)).status, 404)
  await page.getByRole('button', { name: '发布已保存草稿' }).click()
  await page.getByText('已发布。公众现在可以阅读此版本，无需重新部署。').waitFor()
  const html = await (await fetch(`${base}/wiki/p/${slug}`)).text()
  assert(html.includes('中文检索测试'), 'Public content must be rendered in server HTML')
  await page.screenshot({ path: `${output}/editor-desktop.png`, fullPage: true })

  const reader = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  const reading = await reader.newPage()
  await reading.goto(`${base}/wiki/p/${slug}`)
  await reading.getByRole('heading', { name: 'Wiki 联调测试', exact: true, level: 1 }).waitFor()
  await reading.screenshot({ path: `${output}/article-mobile.png`, fullPage: true })
  await reader.close()

  const stale = await context.newPage()
  await stale.goto(page.url())
  await stale.getByLabel('Markdown 正文').waitFor()
  const privateText = `${original}\n\nnever-public-${slug}\n\n<script>window.wikiInjected = true</script>\n\n[危险链接](javascript:alert(1))`
  await page.getByLabel('Markdown 正文').fill(privateText)
  assert.equal(await page.locator('.preview script').count(), 0)
  assert.equal(await page.locator('.preview a[href^="javascript:"]').count(), 0)
  await page.getByLabel('本次修改说明').fill('验证私有草稿与安全渲染')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByText('草稿已保存。公众页面保持不变，发布后才会更新。').waitFor()
  const publicPage = await (await fetch(`${base}/api/v1/wiki/pages/${slug}`)).json()
  assert.equal(publicPage.body_md, original)
  const search = await (await fetch(`${base}/api/v1/wiki/pages?q=never-public-${slug}`)).json()
  assert.equal(search.total, 0)

  await stale.getByLabel('Markdown 正文').fill('旧窗口的修改应该被拒绝')
  await stale.getByRole('button', { name: '保存草稿', exact: true }).click()
  await stale.getByRole('alert').filter({ hasText: '此页面已被修改' }).waitFor()
  assert.equal(await stale.getByLabel('Markdown 正文').inputValue(), '旧窗口的修改应该被拒绝')
  await stale.close()

  await page.getByRole('button', { name: '查看 r1', exact: true }).click()
  await page.getByRole('button', { name: '载入为草稿', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByText('草稿已保存。公众页面保持不变，发布后才会更新。').waitFor()
  await page.getByRole('button', { name: '发布已保存草稿' }).click()
  await page.getByText('已发布。公众现在可以阅读此版本，无需重新部署。').waitFor()
  assert.equal((await (await fetch(`${base}/api/v1/wiki/pages/${slug}`)).json()).body_md, original)

  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const searchPage = await visitor.newPage()
  searchPage.on('pageerror', (e) => errors.push(e.message))
  await searchPage.goto(`${base}/wiki/`, { waitUntil: 'networkidle' })
  await searchPage
    .getByRole('searchbox')
    .count()
    .then(async (count) => {
      if (count) await searchPage.getByRole('searchbox').fill(slug)
      else await searchPage.getByLabel('搜索知识库').fill(slug)
    })
  await searchPage.getByRole('button', { name: '搜索', exact: true }).click()
  await searchPage.getByRole('link', { name: 'Wiki 联调测试', exact: true }).waitFor()
  assert(
    await searchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'Mobile page must not overflow horizontally',
  )
  await searchPage.screenshot({ path: `${output}/search-mobile.png`, fullPage: true })
  await visitor.close()

  await page.getByRole('button', { name: '撤回公开版本' }).click()
  await page.getByText('已撤回公开版本。条目及历史仍保留在工作台。').waitFor()
  assert.equal((await fetch(`${base}/api/v1/wiki/pages/${slug}`)).status, 404)
  assert.equal((await fetch(`${base}/wiki/p/${slug}`)).status, 404)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: login, import, draft isolation, publish, SSR without JS, safe Markdown, conflict preservation, restore, search, mobile layout and withdrawal.',
  )
  console.log(`Screenshots: ${output}`)
} catch (error) {
  if (debugPage && !debugPage.isClosed()) {
    await debugPage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
    console.error('Failure route:', new URL(debugPage.url()).pathname)
    console.error('Browser errors:', errors)
    console.error((await debugPage.locator('body').innerText()).slice(0, 1500))
  }
  throw error
} finally {
  if (token && pageId) {
    // Leave test revisions for inspection, but never leave smoke content publicly listed.
    try {
      const response = await request(`/manage/pages/${pageId}`)
      if (response.ok) {
        const current = await response.json()
        currentVersion = current.version
        if (current.published_revision_id) {
          const withdrawn = await request(`/manage/pages/${pageId}/unpublish`, 'POST', {
            expected_version: currentVersion,
          })
          if (!withdrawn.ok)
            console.error('WARNING: test page withdrawal failed; inspect the local workspace.')
        }
      }
      await fetch(`${base}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      console.error('WARNING: cleanup could not reach local API; inspect the local workspace.')
    }
  }
  await browser.close()
}
