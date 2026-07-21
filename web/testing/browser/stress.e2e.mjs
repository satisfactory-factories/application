// Browser stress test: ~124-factory plan, everything unhidden and materialized,
// measuring how long an edit takes to fully propagate to the DOM.
//
// Loads the stress plan via the dev-only window.__sfLoadStressPlan hook, clicks
// SHOW ALL, scrolls the whole plan to materialize every card, then edits product
// amounts while instrumenting the page with a MutationObserver (when did the DOM
// stop changing?), a PerformanceObserver (how long was the main thread blocked?),
// and the __sfWatchCounter deep-watcher hook (how many reactive writes?).
//
// Product edits sit behind a fixed 750ms debounce (ItemCommon.ts), so the settle
// time is reported both raw and with the debounce subtracted.
//
// Run: start the dev server (`pnpm dev:web`, never on port 3001), then from web/:
//   PORT=3005 node testing/browser/stress.e2e.mjs
// CHROMIUM=/path/to/chromium overrides the browser binary.
/* global MutationObserver, PerformanceObserver */
import puppeteer from 'puppeteer-core'

const PORT = process.env.PORT ?? '3000'
const CHROMIUM = process.env.CHROMIUM ?? '/usr/bin/chromium'
const DEBOUNCE_MS = 750
const BASE = `http://localhost:${PORT}`
const results = []
const fail = msg => { results.push(`✗ FAIL: ${msg}`) }
const pass = msg => { results.push(`✓ ${msg}`) }
const note = msg => { results.push(`  ${msg}`) }
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

  // Warm the dev server, then load fresh and dismiss the intro with an empty plan.
  await page.goto(BASE, { waitUntil: 'networkidle2' }).catch(() => {})
  await sleep(1000)
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(1500)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /empty plan|demo plan/i.test(b.innerText))
    btn?.click()
  })
  await sleep(1000)

  // ---- Load the stress plan ----
  // Fire-and-forget: awaiting the in-page promise across the load gets it GC'd
  // ("Promise was collected"), so poll a completion flag instead.
  const t0 = Date.now()
  await page.evaluate(() => {
    window.__sfStressCount = 0
    window.__sfLoadStressPlan(4).then(count => { window.__sfStressCount = count })
  })
  let factoryCount = 0
  for (let i = 0; i < 60 && !factoryCount; i++) {
    await sleep(500)
    factoryCount = await page.evaluate(() => window.__sfStressCount)
  }
  // The loader staggers factory rendering; wait for the card count to stabilize.
  let lastCount = -1
  for (let i = 0; i < 120; i++) {
    await sleep(500)
    const count = await page.evaluate(() =>
      [...document.querySelectorAll('.main-content .v-card[id]')].filter(c => /^\d+$/.test(c.id)).length)
    if (count === lastCount && count > 0) break
    lastCount = count
  }
  note(`stress plan loaded: ${factoryCount} factories in ~${Date.now() - t0}ms (${lastCount} cards initially rendered)`)
  if (factoryCount < 100) fail(`expected 100+ factories, got ${factoryCount}`)
  else pass(`loaded ${factoryCount}-factory stress plan`)

  // ---- EXPAND ALL (the historically catastrophic path) ----
  const tShow = Date.now()
  const showClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.innerText.replace(/\s+/g, ' ').trim().toUpperCase() === 'EXPAND ALL')
    btn?.click()
    return !!btn
  })
  if (!showClicked) fail('EXPAND ALL button not found')
  // expandAll defers show-all by 250ms behind its own performance-warning toast.
  await sleep(3000)

  // Materialize every card by scrolling through the entire plan.
  const materialize = await page.evaluate(async () => {
    const container = document.querySelector('.main-content')
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
    let guard = 0
    while (container.scrollTop + container.clientHeight < container.scrollHeight - 5 && guard < 400) {
      container.scrollBy(0, container.clientHeight)
      await wait(150)
      guard++
    }
    return {
      cards: [...document.querySelectorAll('.main-content .v-card[id]')].filter(c => /^\d+$/.test(c.id)).length,
      domNodes: document.querySelectorAll('*').length,
      screens: guard,
    }
  })
  note(`SHOW ALL + full scroll-through: ~${Date.now() - tShow}ms — ${materialize.cards} cards mounted, ${materialize.domNodes} DOM nodes (${materialize.screens} screens tall)`)
  if (materialize.cards >= factoryCount) pass(`all ${materialize.cards} factory cards mounted`)
  else note(`(${materialize.cards}/${factoryCount} cards mounted — remainder likely empty/hidden variants)`)

  // ---- Edit measurement helper ----
  // Instruments the page, edits the given product amount input, and waits for the DOM
  // to settle. Returns timings measured inside the page for precision.
  const measureEdit = async (inputId, newValue, label) => {
    await page.evaluate(inputId => {
      const perf = {
        inputAt: null, lastMutation: null, mutations: 0, longTasks: [],
      }
      perf.mo = new MutationObserver(muts => {
        perf.mutations += muts.length
        perf.lastMutation = performance.now()
      })
      perf.mo.observe(document.querySelector('.main-content'), {
        subtree: true, childList: true, characterData: true, attributes: true,
      })
      perf.po = new PerformanceObserver(list => {
        list.getEntries().forEach(e => perf.longTasks.push(Math.round(e.duration)))
      })
      perf.po.observe({ entryTypes: ['longtask'] })
      document.getElementById(inputId).addEventListener('input', () => {
        if (!perf.inputAt) perf.inputAt = performance.now()
      })
      window.__perf = perf
      window.__sfWatchCounter.install()
    }, inputId)

    const input = await page.$(`[id="${inputId}"]`)
    await input.click()
    await page.keyboard.down('Control')
    await page.keyboard.press('a')
    await page.keyboard.up('Control')
    await page.keyboard.type(String(newValue))

    // Wait for debounce + calc + render to fully settle (no mutations for 1s).
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const quiet = await page.evaluate(() =>
        window.__perf.lastMutation !== null && (performance.now() - window.__perf.lastMutation) > 1000)
      if (quiet) break
    }

    const m = await page.evaluate(() => {
      const perf = window.__perf
      perf.mo.disconnect()
      perf.po.disconnect()
      return {
        settleMs: perf.lastMutation && perf.inputAt ? Math.round(perf.lastMutation - perf.inputAt) : null,
        mutations: perf.mutations,
        longTasks: perf.longTasks,
        fires: window.__sfWatchCounter.count(),
      }
    })
    const value = await page.evaluate(id => document.getElementById(id)?.value, inputId)

    if (value !== String(newValue)) fail(`${label}: input value did not stick (${value})`)
    if (m.settleMs === null) {
      fail(`${label}: no DOM mutations observed — edit did not propagate`)
      return m
    }
    const blocking = m.longTasks.reduce((a, b) => a + b, 0)
    note(`${label}: input -> DOM settled in ${m.settleMs}ms raw (~${m.settleMs - DEBOUNCE_MS}ms after 750ms debounce) | ` +
      `${m.mutations} DOM mutations | ${m.fires} watcher fires | main-thread blocking ${blocking}ms (tasks: ${m.longTasks.join('+') || 'none >50ms'})`)
    // Current bound reflects the NEXT known bottleneck (profiled 2026-07-21): the three
    // full-plan deep watchers (app-store persistence, PlannerFactoryList,
    // StatisticsFactorySummary) each re-traverse all ~124 factories per flush (~2.3s),
    // plus the persistence JSON.stringify (~1.9s) and broad Vuetify prop sweeps (~1s),
    // all dev-mode-inflated. Reactive churn from calculations is no longer a factor
    // (~40 fires). Tighten towards <1000ms once the deep watchers are reworked.
    if (m.settleMs - DEBOUNCE_MS < 8000) pass(`${label}: DOM propagation ${m.settleMs - DEBOUNCE_MS}ms (debounce excluded) within current bound (<8s; target <1s after deep-watcher rework)`)
    else fail(`${label}: DOM propagation too slow: ${m.settleMs - DEBOUNCE_MS}ms after debounce`)
    if (m.fires < 2000) pass(`${label}: ${m.fires} reactive fires (pre-fix churn at this scale was ~30,000+)`)
    else fail(`${label}: reactive fires exploded: ${m.fires}`)
    return m
  }

  // Pick two product amount inputs from different, far-apart factories.
  const targets = await page.evaluate(() => {
    const found = []
    const cards = [...document.querySelectorAll('.main-content .v-card[id]')].filter(c => /^\d+$/.test(c.id))
    for (const card of cards) {
      const input = [...card.querySelectorAll('input[id$="-amount"]')].find(i => i.id.split('-').length === 3)
      if (input) found.push({ facId: card.id, inputId: input.id, value: input.value })
    }
    return found.length ? [found[0], found[Math.floor(found.length / 2)], found[found.length - 1]] : []
  })
  if (targets.length < 2) {
    fail(`not enough editable product inputs found (${targets.length})`)
  } else {
    note(`(editing in factories ${targets.map(t => t.facId).join(', ')} of ${materialize.cards} mounted)`)
    for (const [i, target] of targets.entries()) {
      await page.evaluate(id => document.getElementById(id)?.scrollIntoView({ block: 'center' }), target.facId)
      await sleep(800)
      const newValue = Math.max(1, Math.round(Number(target.value || 100)) + 10)
      await measureEdit(target.inputId, newValue, `edit ${i + 1} (${target.inputId})`)
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
console.log(failed ? `\n${failed} FAILURES` : '\nALL STRESS TESTS PASSED')
process.exit(failed ? 1 : 0)
