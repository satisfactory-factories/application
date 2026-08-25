// Browser-level regression tests for checklist-mode checkboxes (#592, #593).
//
// Two things can't be caught by the (jsdom-backed) unit suite and need a real browser:
//  - hit-testing: a checkbox nested inside another clickable element (a chip with its own
//    @click and Vuetify ripple layer) can have its clicks intercepted before they ever reach
//    the input — jsdom's `trigger('click')` dispatches straight onto the target node and
//    never exercises real coordinate-based hit-testing, so it can't see this at all.
//  - the native checkbox click race: a `@click.prevent`-cancelled checkbox click makes the
//    browser revert the checkbox to its pre-click state as part of canceling the default
//    action; a naive `:checked` binding can lose that race and never (visually) apply the
//    real toggle. jsdom's own timing for this does not reliably match a real browser's.
//
// Drives the real planner (demo plan) and, for each of Products, Imports and the Exports
// chip under Satisfaction: real-clicks the checklist tick with actual mouse coordinates,
// confirms it (a) ends up in the opposite of its prior state and stays there, and (b) that
// change is reflected in the other place the same tick is drawn (the top-of-card Checklist
// panel) — in both directions. The Exports case additionally confirms the click doesn't also
// open the Export Calculator, which is what nesting the tick inside the chip used to do.
//
// Run: start the dev server (`pnpm dev:web`, note the port), then from web/:
//   node testing/browser/checklist-checkbox.e2e.mjs            # against port 3000
//   PORT=3005 node testing/browser/checklist-checkbox.e2e.mjs  # other port
// Never run the dev server on port 3001 — vitest's global-setup gameData server binds it.
// CHROMIUM=/path/to/chromium overrides the browser binary.
import puppeteer from 'puppeteer-core'

const PORT = process.env.PORT ?? '3000'
const CHROMIUM = process.env.CHROMIUM ?? '/usr/bin/chromium'
const BASE = `http://localhost:${PORT}`
const results = []
const fail = msg => { results.push(`✗ FAIL: ${msg}`) }
const pass = msg => { results.push(`✓ ${msg}`) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1600,1200',
  ],
})

// Real-clicks the checkbox found by `findFn` (a function serialized and re-run in-page, so it
// must be self-contained) via actual mouse coordinates, then polls until its `.checked` matches
// `expected` (or times out). `findFn` is re-run fresh on every poll — never hold a DOM reference
// across a click, since a checked-value-keyed checkbox is a brand new node afterward.
const realClickAndAwait = async (page, findFn, expected) => {
  const box = await page.evaluate(fn => {
    // eslint-disable-next-line no-eval
    const input = eval(`(${fn})`)()
    if (!input) return null
    input.scrollIntoView({ block: 'center' })
    const rect = input.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }, findFn.toString())
  if (!box) return 'NOT_FOUND'
  await sleep(200)
  await page.mouse.click(box.x, box.y)
  let checked
  for (let i = 0; i < 10; i++) {
    await sleep(300)
    checked = await page.evaluate(fn => {
      // eslint-disable-next-line no-eval
      const input = eval(`(${fn})`)()
      return input ? input.checked : 'MISSING'
    }, findFn.toString())
    if (checked === expected) break
  }
  return checked
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1200 })
  page.on('dialog', d => d.accept())
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('dismissed-introduction', 'true')
    localStorage.setItem('seenV51Splash', 'true')
    localStorage.setItem('seenV6Splash', 'true')
    localStorage.setItem('buildingGroupTutorialOpened', 'true')
  })

  // Warm the dev server first: on a cold vite instance the initial dynamic imports can
  // time out mid-transform and pollute the pageerror log with recoverable noise.
  await page.goto(BASE, { waitUntil: 'networkidle2' }).catch(() => {})
  await sleep(1000)
  await page.goto(`${BASE}/?setupDemo=true`, { waitUntil: 'networkidle2' })
  await sleep(2000)
  await page.waitForSelector('.main-content .v-card[id]', { timeout: 15000 })

  // Enable checklist mode on every factory card.
  const toggleIds = await page.evaluate(() =>
    [...document.querySelectorAll('input[id$="-checklist-toggle"]')].map(el => el.id))
  for (const id of toggleIds) {
    await page.evaluate(toggleId => {
      document.getElementById(toggleId)?.closest('.v-switch')?.querySelector('.v-selection-control__input')?.click()
    }, id)
  }
  await sleep(1500)
  if (toggleIds.length > 0) pass(`checklist mode enabled on ${toggleIds.length} factory card(s)`)
  else fail('no checklist toggles found — demo plan may not have loaded')

  // ---- Products ----
  {
    const target = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.main-content .v-card[id]')]
      for (const card of cards) {
        const items = [...card.querySelectorAll('.factory-item')]
        for (const item of items) {
          const input = item.querySelector('input.checklist-tick')
          if (input) {
            const select = item.querySelector('input[type="text"]')
            return { cardId: card.id, itemLabel: select ? select.value : null, before: input.checked }
          }
        }
      }
      return null
    })
    if (!target) {
      fail('Products: no product checkbox found to test')
    } else {
      const expected = !target.before
      const find = /* re-run in-page */ () => {
        // eslint-disable-next-line no-undef
        const card = document.getElementById(TARGET.cardId)
        const items = [...card.querySelectorAll('.factory-item')]
        for (const item of items) {
          const select = item.querySelector('input[type="text"]')
          // eslint-disable-next-line no-undef
          if (select?.value === TARGET.itemLabel) return item.querySelector('input.checklist-tick')
        }
        return null
      }
      await page.evaluate(t => { window.TARGET = t }, target)
      const after = await realClickAndAwait(page, find, expected)
      if (after === expected) pass(`Products: real click toggled the row's own checkbox to ${expected}`)
      else fail(`Products: row checkbox ended at ${after}, expected ${expected}`)

      const syncedToChecklist = await page.evaluate(t => {
        const card = document.getElementById(t.cardId)
        const group = [...card.querySelectorAll('.checklist-group')]
          .find(g => g.querySelector('.checklist-group-title')?.textContent.trim() === 'Products')
        if (!group) return 'NO_GROUP'
        const row = [...group.querySelectorAll('.checklist-row')].find(r => r.textContent.includes(t.itemLabel))
        return row ? row.querySelector('input.checklist-tick')?.checked : 'ROW_NOT_FOUND'
      }, target)
      if (syncedToChecklist === expected) pass(`Products: Checklist panel reflects the same product as ${expected}`)
      else fail(`Products: Checklist panel shows ${syncedToChecklist}, expected ${expected}`)

      // Reverse direction: toggle it back via the Checklist panel, confirm the product row follows.
      const backExpected = target.before
      const findViaChecklist = () => {
        // eslint-disable-next-line no-undef
        const card = document.getElementById(TARGET.cardId)
        const group = [...card.querySelectorAll('.checklist-group')]
          .find(g => g.querySelector('.checklist-group-title')?.textContent.trim() === 'Products')
        // eslint-disable-next-line no-undef
        const row = [...group.querySelectorAll('.checklist-row')].find(r => r.textContent.includes(TARGET.itemLabel))
        return row ? row.querySelector('input.checklist-tick') : null
      }
      const backResult = await realClickAndAwait(page, findViaChecklist, backExpected)
      const productRowBack = await page.evaluate(t => {
        const card = document.getElementById(t.cardId)
        const items = [...card.querySelectorAll('.factory-item')]
        for (const item of items) {
          const select = item.querySelector('input[type="text"]')
          if (select?.value === t.itemLabel) return item.querySelector('input.checklist-tick')?.checked
        }
        return 'NOT_FOUND'
      }, target)
      if (backResult === backExpected && productRowBack === backExpected) {
        pass('Products: Checklist panel -> product row sync works in reverse too')
      } else {
        fail(`Products: reverse sync failed (checklist=${backResult}, row=${productRowBack}, expected ${backExpected})`)
      }
    }
  }

  // ---- Imports ----
  {
    const target = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.main-content .v-card[id]')]
      for (const card of cards) {
        const rows = [...card.querySelectorAll('.status-anchor.selectors')]
        for (const row of rows) {
          const input = row.querySelector('input.checklist-tick')
          if (input) return { cardId: card.id, rowId: row.id, before: input.checked }
        }
      }
      return null
    })
    if (!target) {
      fail('Imports: no import checkbox found to test')
    } else {
      const expected = !target.before
      await page.evaluate(t => { window.TARGET = t }, target)
      const find = () => {
        // eslint-disable-next-line no-undef
        return document.getElementById(TARGET.rowId)?.querySelector('input.checklist-tick')
      }
      const after = await realClickAndAwait(page, find, expected)
      if (after === expected) pass(`Imports: real click toggled the row's own checkbox to ${expected}`)
      else fail(`Imports: row checkbox ended at ${after}, expected ${expected}`)

      const syncedToChecklist = await page.evaluate(t => {
        const card = document.getElementById(t.cardId)
        const group = [...card.querySelectorAll('.checklist-group')]
          .find(g => g.querySelector('.checklist-group-title')?.textContent.trim() === 'Imports')
        if (!group) return 'NO_GROUP'
        const ticks = [...group.querySelectorAll('input.checklist-tick')]
        return ticks.length === 1 ? ticks[0].checked : ticks.some(i => i.checked)
      }, target)
      if (syncedToChecklist === expected) pass(`Imports: Checklist panel reflects the same import as ${expected}`)
      else fail(`Imports: Checklist panel shows ${syncedToChecklist}, expected ${expected}`)
    }
  }

  // ---- Exports (the export chip under a factory's Satisfaction table) ----
  {
    const target = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('tr[id*="-satisfaction-item-"]')]
      for (const row of rows) {
        const input = row.querySelector('input.checklist-tick')
        if (input) return { rowId: row.id, before: input.checked }
      }
      return null
    })
    if (!target) {
      fail('Exports: no export chip checkbox found to test')
    } else {
      const expected = !target.before
      await page.evaluate(t => { window.TARGET = t }, target)
      const find = () => {
        // eslint-disable-next-line no-undef
        return document.getElementById(TARGET.rowId)?.querySelector('input.checklist-tick')
      }
      const after = await realClickAndAwait(page, find, expected)
      if (after === expected) pass(`Exports: real click toggled the export chip's own checkbox to ${expected}`)
      else fail(`Exports: chip checkbox ended at ${after}, expected ${expected}`)

      const calculatorOpened = await page.evaluate(() => !!document.querySelector('.calculator-row'))
      if (!calculatorOpened) pass('Exports: clicking the tick did not also open the Export Calculator')
      else fail('Exports: clicking the tick leaked through and opened the Export Calculator')
    }
  }

  const realErrors = pageErrors.filter(e => !e.includes('Failed to fetch dynamically imported module'))
  if (realErrors.length) fail(`page errors: ${realErrors.slice(0, 5).join(' | ')}`)
  else pass('no page errors during entire run')
} finally {
  await browser.close()
}

console.log(results.join('\n'))
const failed = results.filter(r => r.includes('FAIL')).length
console.log(failed ? `\n${failed} FAILURES` : '\nALL BROWSER TESTS PASSED')
process.exit(failed ? 1 : 0)
