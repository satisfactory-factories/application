// Browser-level reactivity tests for the calculation clone-run-commit path.
//
// Drives the real planner (demo plan + Mael's MegaPlan) and asserts that:
//  - editing product amounts updates dependent satisfaction numbers in the DOM,
//  - the "+ New" shortage flow creates and renders a new factory,
//  - the number of deep-watcher fires per interaction stays bounded (~30, not
//    thousands), via the dev-only window.__sfWatchCounter hook in app-store.
//
// Run: start the dev server (`pnpm dev:web`, note the port), then from web/:
//   node testing/browser/reactivity.e2e.mjs            # against port 3000
//   PORT=3005 node testing/browser/reactivity.e2e.mjs  # other port
// Never run the dev server on port 3001 — vitest's global-setup gameData server
// binds it, and a vite instance squatting there breaks the unit suite.
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
    '--window-size=1600,1000',
  ],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000 })
  page.on('dialog', d => d.accept())
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))

  // ---- Load demo plan ----
  // Warm the dev server first: on a cold vite instance the initial dynamic imports can
  // time out mid-transform and pollute the pageerror log with recoverable noise.
  await page.goto(BASE, { waitUntil: 'networkidle2' }).catch(() => {})
  await sleep(1000)
  await page.goto(`${BASE}/?setupDemo=true`, { waitUntil: 'networkidle2' })
  await sleep(1500)

  // Dismiss intro modal if present
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.toLowerCase().includes('demo plan'))
    btn?.click()
  })
  await sleep(1500)
  const overlayGone = await page.evaluate(() => !document.querySelector('.v-overlay--active'))
  if (!overlayGone) await sleep(2000)

  await page.waitForSelector('.main-content .v-card[id]', { timeout: 15000 })

  // Discover factories: numeric-id cards; the name lives in the .factory-name input's value
  const factories = await page.evaluate(() => {
    return [...document.querySelectorAll('.main-content .v-card[id]')]
      .filter(card => /^\d+$/.test(card.id))
      .map(card => ({
        id: card.id,
        name: (card.querySelector('.factory-name input') ?? card.querySelector('.factory-name'))?.value ?? '',
      }))
  })
  results.push(`  (demo factories: ${factories.map(f => `${f.name}#${f.id}`).join(', ')})`)

  // Watch counter hook present?
  const hookOk = await page.evaluate(() => typeof window.__sfWatchCounter?.install === 'function')
  if (hookOk) pass('dev watch-counter hook is present')
  else fail('dev watch-counter hook missing')

  const copperBasics = factories.find(f => /^copper basics$/i.test(f.name.trim()))
  if (!copperBasics) {
    fail('Copper Basics factory not found in demo plan')
    throw new Error('cannot continue without Copper Basics card')
  }

  const remSel = `[id="${copperBasics.id}-satisfaction-CopperIngot-remaining"]`

  // ---- TEST 2: "+ New" shortage factory ----
  // Cards (and their satisfaction sections) materialize lazily; scroll there and wait
  // for the satisfaction table to exist before searching for its buttons.
  await page.evaluate(id => document.getElementById(id)?.scrollIntoView({ block: 'center' }), copperBasics.id)
  // The intro-dismiss reloads the plan with staggered re-rendering; wait for the
  // satisfaction section (and its + NEW button) to settle rather than sleeping.
  await page.waitForFunction(facId => {
    const card = document.getElementById(facId)
    return [...(card?.querySelectorAll('button') ?? [])]
      .some(b => b.innerText.replace(/\s+/g, ' ').trim().toUpperCase() === '+ NEW')
  }, { timeout: 20000 }, copperBasics.id).catch(() => {})
  await sleep(500)
  await page.evaluate(() => { window.__sfWatchCounter.install() })
  const cardCountBefore = await page.evaluate(() => document.querySelectorAll('.main-content .v-card[id]').length)
  const newBtnClicked = await page.evaluate(facId => {
    const card = document.getElementById(facId)
    const btn = [...(card?.querySelectorAll('button') ?? [])]
      .find(b => b.innerText.replace(/\s+/g, ' ').trim().toUpperCase() === '+ NEW')
    if (!btn) return false
    btn.click()
    return true
  }, copperBasics.id)

  if (!newBtnClicked) {
    const cardButtons = await page.evaluate(
      facId => [...(document.getElementById(facId)?.querySelectorAll('button') ?? [])]
        .map(b => b.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
      copperBasics.id,
    )
    fail(`"+ New" shortage button not found (card buttons: ${cardButtons.join(' | ')})`)
  } else {
    const t0 = Date.now()
    await sleep(2500) // 50ms paint delay + calc + toast + scroll
    const addMs = Date.now() - t0
    const fires = await page.evaluate(() => window.__sfWatchCounter.count())
    const toastSeen = await page.evaluate(() => document.body.innerText.includes('Created "'))
    const cardCountAfter = await page.evaluate(() => document.querySelectorAll('.main-content .v-card[id]').length)

    if (toastSeen) pass('"+ New" toast appeared')
    else fail('"+ New" toast missing')
    if (cardCountAfter > cardCountBefore) pass(`new factory card rendered (${cardCountBefore} -> ${cardCountAfter})`)
    else fail(`no new factory card (${cardCountBefore} -> ${cardCountAfter})`)
    const remAfterFix = await page.evaluate(sel => document.querySelector(sel)?.innerText ?? null, remSel)
    results.push(`  (shortage remaining after + New: ${remAfterFix}; fires: ${fires}; wall: ~${addMs}ms incl. fixed waits)`)
    if (fires > 0 && fires < 1000) pass(`"+ New" reactive fires bounded: ${fires}`)
    else fail(`"+ New" fires out of range: ${fires}`)
  }

  // ---- TEST 1: shortage number reacts to a product amount edit ----
  // Copper Basics has a CopperIngot shortage; its own products consume Copper Ingots,
  // so raising a product amount must deepen the displayed shortage.
  await page.evaluate(id => document.getElementById(id)?.scrollIntoView({ block: 'center' }), copperBasics.id)
  await sleep(1000)
  const remBefore = await page.evaluate(sel => document.querySelector(sel)?.innerText ?? null, remSel)

  // Find a product amount input in Copper Basics that consumes copper ingots (any product will do)
  const amountInputSel = await page.evaluate(facId => {
    const inputs = [...document.querySelectorAll(`input[id^="${facId}-"][id$="-amount"]`)]
    const productInput = inputs.find(i => !i.id.includes('satisfaction'))
    return productInput?.id ?? null
  }, copperBasics.id)
  if (!amountInputSel) {
    fail('no product amount input found in Copper Basics')
  } else {
    await page.evaluate(() => { window.__sfWatchCounter.install() })
    const t0 = Date.now()
    const input = await page.$(`[id="${amountInputSel}"]`)
    await input.click()
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control')
    await page.keyboard.type('500')
    await sleep(1500) // debounce + recalc
    const editMs = Date.now() - t0
    const fires = await page.evaluate(() => window.__sfWatchCounter.count())
    const remAfter = await page.evaluate(sel => document.querySelector(sel)?.innerText ?? null, remSel)

    if (remBefore !== null && remAfter !== null && remAfter !== remBefore) {
      pass(`product edit updates satisfaction display (${remBefore} -> ${remAfter})`)
    } else {
      fail(`satisfaction display did not react to product edit (before=${remBefore}, after=${remAfter})`)
    }
    if (fires > 0 && fires < 500) pass(`product edit reactive fires bounded: ${fires} (was ~2,400+ churn pre-change)`)
    else fail(`product edit fires out of expected range: ${fires}`)
    results.push(`  (edit round-trip incl. debounce: ${editMs}ms)`)
  }

  // ---- TEST 1b: reverse-solve round-trip exactness ----
  // Typing a whole number into a Requires (ingredient) input reverse-solves the product
  // amount (1234 oil -> 822.667 plastic) and recomputes the ingredient — which used to
  // settle at 1234.001 from double rounding. It must settle at exactly what was typed.
  const oilInputSel = '[id="1-Plastic-LiquidOil-amount"]'
  await page.evaluate(() => document.getElementById('1')?.scrollIntoView({ block: 'center' }))
  await sleep(1000)
  const oilInput = await page.$(oilInputSel)
  if (!oilInput) {
    fail('reverse-solve: Plastic LiquidOil requirement input not found')
  } else {
    await oilInput.click()
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control')
    await page.keyboard.type('1234')
    await sleep(1500) // debounce + recalc + write-back
    const settled = await page.evaluate(sel => document.querySelector(sel)?.value, oilInputSel)
    if (settled === '1234') pass('reverse-solve round-trip: typed 1234 into Requires, settled at exactly 1234')
    else fail(`reverse-solve round-trip: typed 1234, settled at "${settled}"`)
  }

  // ---- TEST 3: MegaPlan (large real plan) ----
  const tplClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /templates/i.test(b.innerText))
    if (!btn) return false
    btn.click()
    return true
  })
  await sleep(1000)
  const maelClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /MegaPlan/i.test(b.innerText))
    if (!btn) return false
    btn.click()
    return true
  })
  if (!tplClicked || !maelClicked) {
    fail(`could not open MegaPlan template (templates=${tplClicked}, mael=${maelClicked})`)
  } else {
    const t0 = Date.now()
    await page.waitForFunction(
      () => document.querySelectorAll('.main-content .v-card[id]').length > 10,
      { timeout: 60000 },
    )
    await sleep(3000) // staggered card materialization
    const loadMs = Date.now() - t0
    const megaCount = await page.evaluate(() => document.querySelectorAll('.main-content .v-card[id]').length)
    pass(`MegaPlan loaded: ${megaCount}+ factory cards in ~${loadMs}ms`)

    // Edit a product amount (id shape: <facId>-<partId>-amount) in the first
    // materialized card that has one, and confirm bounded fires + DOM reaction
    const target = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.main-content .v-card[id]')].filter(c => /^\d+$/.test(c.id))
      for (const card of cards) {
        const input = [...card.querySelectorAll('input[id$="-amount"]')]
          .find(i => i.id.split('-').length === 3)
        if (input) return { facId: card.id, inputId: input.id }
      }
      return null
    })
    if (!target) {
      fail('MegaPlan: no product amount input found in first card')
    } else {
      await page.evaluate(id => document.getElementById(id)?.scrollIntoView({ block: 'center' }), target.facId)
      await sleep(800)
      await page.evaluate(() => { window.__sfWatchCounter.install() })
      const input = await page.$(`[id="${target.inputId}"]`)
      const valBefore = await page.evaluate(el => el.value, input)
      const t1 = Date.now()
      await input.click()
      await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control')
      await page.keyboard.type(String(Number(valBefore || 100) + 10))
      await sleep(2000) // debounce + full-plan recalc
      const megaEditMs = Date.now() - t1
      const fires = await page.evaluate(() => window.__sfWatchCounter.count())
      const valAfter = await page.evaluate(el => el.value, input)
      if (valAfter !== valBefore) pass(`MegaPlan product edit applied (${valBefore} -> ${valAfter})`)
      else fail(`MegaPlan product edit did not apply (still ${valAfter})`)
      if (fires > 0 && fires < 2000) pass(`MegaPlan edit reactive fires bounded: ${fires} (deep-watcher fires across a ~40-factory plan)`)
      else fail(`MegaPlan edit fires out of range: ${fires}`)
      results.push(`  (MegaPlan edit round-trip incl. debounce: ${megaEditMs}ms)`)

      // ---- TEST 4: persistence survives a reload ----
      // Persistence is event-driven (no deep watcher): calculation edits persist via the
      // debounced factoryUpdated save, and non-calc mutations (like a factory rename,
      // which emits no events) must be flushed by the pagehide handler on reload.
      await sleep(1500) // let the debounced persist fire for the edit above
      const renamed = await page.evaluate(facId => {
        const nameInput = document.getElementById(facId)?.querySelector('input.factory-name')
        if (!nameInput) return null
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(nameInput, 'Persistence Check Factory')
        nameInput.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      }, target.facId)
      if (!renamed) {
        fail('persistence: could not rename target factory')
      } else {
        await sleep(300)
        // Plain URL — a reload would re-run ?setupDemo=true and overwrite the plan.
        // The navigation itself fires pagehide, which must flush the pending save.
        await page.goto(BASE, { waitUntil: 'networkidle2' })
        await sleep(3000)
        const persisted = await page.evaluate(({ inputId, facId }) => {
          const tabs = JSON.parse(localStorage.getItem('factoryTabs') ?? '[]')
          const factories = tabs.flatMap(tab => tab.factories ?? [])
          const factory = factories.find(fac => String(fac.id) === facId)
          const partId = inputId.split('-')[1]
          const product = factory?.products.find(p => p.id === partId)
          return { name: factory?.name ?? null, amount: product?.amount ?? null }
        }, { inputId: target.inputId, facId: target.facId })
        const expectedAmount = Number(valAfter)
        if (persisted.amount === expectedAmount) pass(`persistence: product edit survived reload (${persisted.amount})`)
        else fail(`persistence: product edit lost on reload (stored ${persisted.amount}, expected ${expectedAmount})`)
        if (persisted.name === 'Persistence Check Factory') pass('persistence: non-calc rename flushed on reload (pagehide)')
        else fail(`persistence: rename lost on reload (stored "${persisted.name}")`)
      }
    }
  }

  // Cold vite dev servers can abort a dynamic import mid-transform; the app retries and
  // recovers, so that specific error is dev-tooling noise rather than an app failure.
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
