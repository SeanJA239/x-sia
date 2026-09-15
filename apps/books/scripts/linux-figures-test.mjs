import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createFigures } from './figures.mjs'

const output = fileURLToPath(new URL('../../../.local/wiki-linux-v0.4/figures/', import.meta.url))
await mkdir(output, { recursive: true })
const { figs } = createFigures()
const checked = []
const browser = await chromium.launch({
  channel: process.env.BOOKS_BROWSER_CHANNEL || 'msedge',
  headless: true,
})
try {
  const page = await browser.newPage({ viewport: { width: 940, height: 400 } })
  await page.route('**/*', (route) => route.abort())
  for (const id of [...figs.keys()].filter((id) => id.startsWith('linux-'))) {
    const svg = figs.get(id)
    assert.ok(svg)
    // Only the repository's original SVGs are inlined. No reader input or fetched HTML.
    await page.setContent(
      `<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"></head><body>${svg}</body></html>`,
    )
    await page.evaluate(() => document.fonts.ready)
    const issues = await page.evaluate(() => {
      const svg = document.querySelector('svg')
      const bounds = svg.viewBox.baseVal
      return [...svg.querySelectorAll('text')]
        .filter((text) => {
          const box = text.getBBox()
          return (
            box.x < bounds.x ||
            box.y < bounds.y ||
            box.x + box.width > bounds.x + bounds.width ||
            box.y + box.height > bounds.y + bounds.height
          )
        })
        .map((text) => text.textContent)
    })
    assert.deepEqual(issues, [], `${id}: out-of-bounds text`)
    await page.locator('svg').screenshot({ path: path.join(output, `${id}.png`) })
    checked.push(id)
  }
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        checked,
        checks: 'SVG text bounds and bounded screenshots, not full visual/editorial review',
      },
      null,
      2,
    ),
  )
  console.log(`Passed text bounds for ${checked.length} Linux figures`)
} finally {
  await browser.close()
}
