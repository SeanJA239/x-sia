import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.env.WIKI_BASE_URL ?? 'http://localhost:8787'
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
assert(
  process.env.WIKI_TEST_EMAIL && process.env.WIKI_TEST_PASSWORD,
  'Set local admin test credentials in environment variables',
)
const output = fileURLToPath(new URL('../../../.local/wiki-navigation/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  channel: process.env.WIKI_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
})
let token
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/wiki/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('邮箱', { exact: true }).fill(process.env.WIKI_TEST_EMAIL)
  await page.getByLabel('密码', { exact: true }).fill(process.env.WIKI_TEST_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/wiki/manage')
  await page.getByRole('link', { name: '新建 / 导入条目', exact: true }).waitFor()
  token = await page.evaluate(() => localStorage.getItem('x-sia:token'))

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await page
      .getByRole('navigation', { name: '平台导航' })
      .getByRole('link', { name: '活动', exact: true })
      .click()
    await page.waitForURL('**/activities')
    const wikiLink = page.getByRole('link', { name: 'Wiki', exact: true })
    await wikiLink.waitFor()
    for (const name of ['首页', '活动', '卡片', '资源', '我的']) {
      await page.getByRole('link', { name, exact: true }).waitFor()
    }
    assert.equal(await wikiLink.getAttribute('href'), '/wiki/')
    if (width === 390) {
      const bounds = await wikiLink.boundingBox()
      assert(
        bounds && bounds.y > 700 && bounds.y + bounds.height <= 844,
        'Wiki must be visible in the mobile bottom navigation',
      )
    }
    await page.screenshot({ path: `${output}/activities-${width}.png`, fullPage: true })
    await wikiLink.click()
    await page.waitForURL('**/wiki/')
    await page.getByRole('heading', { name: '工程知识体系', exact: true }).waitFor()
    const platform = page.getByRole('navigation', { name: '平台导航' })
    assert.equal(
      await platform.getByRole('link', { name: 'Wiki', exact: true }).getAttribute('aria-current'),
      'page',
    )
    for (const name of ['首页', '活动', '卡片', '资源', '我的']) {
      await platform.getByRole('link', { name, exact: true }).waitFor()
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: `${output}/wiki-${width}.png`, fullPage: true })
    await page
      .getByRole('navigation', { name: 'Wiki 导航' })
      .getByRole('link', { name: '编辑工作台' })
      .click()
    await page.waitForURL('**/wiki/manage')
    await page.getByRole('link', { name: '新建 / 导入条目', exact: true }).waitFor()
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: desktop/mobile Activities ↔ Wiki navigation; six peer entries; shared login; no horizontal overflow or uncaught browser errors.',
  )
  console.log(`Screenshots: ${output}`)
} finally {
  if (token)
    await fetch(`${base}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  await browser.close()
}
