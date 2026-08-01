// Browser verification for #506 factory status indicators.
import puppeteer from 'puppeteer-core'

const PORT = process.env.PORT || 3005
const BASE = `http://localhost:${PORT}`
const SHOTS = process.env.SHOTS || '.'

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  headless: 'new',
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1600,1200',
  ],
  defaultViewport: { width: 1600, height: 1200 },
})

const page = await browser.newPage()
page.on('dialog', d => d.accept())
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))

// Warm the vite instance, then load the demo plan.
await page.goto(BASE, { waitUntil: 'networkidle2' })
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('dismissed-introduction', 'true')
  localStorage.setItem('seenV51Splash', 'true')
  localStorage.setItem('buildingGroupTutorialOpened', 'true')
})
await page.goto(`${BASE}/?setupDemo=true`, { waitUntil: 'networkidle2' })
await sleep(3000)

// Dismiss anything still overlaying.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /demo plan/i.test(b.innerText))
  if (btn && document.querySelector('.v-overlay--active')) btn.click()
})
await sleep(1500)

// --- helpers -------------------------------------------------------------
const rowInfo = async name => page.evaluate(n => {
  const cards = [...document.querySelectorAll('.factory-list .factory-card')]
  const card = cards.find(c => c.innerText.split('\n')[0].trim().startsWith(n.slice(0, 14)))
  if (!card) return null
  const wrap = card.querySelector('.status-chips')
  const chips = [...card.querySelectorAll('.status-chips .v-chip')].map(c => c.innerText.trim())
  return {
    classes: card.className,
    hasProblem: card.classList.contains('problem'),
    hasWarning: card.classList.contains('warning'),
    chips,
    wrapperOpen: wrap ? wrap.classList.contains('open') : null,
    wrapperAnimated: wrap ? wrap.classList.contains('animated') : null,
    height: card.getBoundingClientRect().height,
  }
}, name)

// --- 1. shortage renders red + a named chip ------------------------------
const copper = await rowInfo('Copper Basics')
check('sidebar row exists for Copper Basics', !!copper, JSON.stringify(copper?.chips))
check('shortage paints the row red', copper?.hasProblem === true, copper?.classes)
check('shortage renders a named chip', (copper?.chips || []).some(c => /Shortage/i.test(c)),
  JSON.stringify(copper?.chips))
check('chips wrapper is open', copper?.wrapperOpen === true)

// --- 2. no animation on first paint (gate lets it through after mount) ----
check('animation gate is armed after mount', copper?.wrapperAnimated === true)

// --- 3. card header carries the same chip --------------------------------
// Cards lazy-materialize as they scroll into view, so navigate there first.
const gotoFactory = async name => {
  await page.evaluate(n => {
    const cards = [...document.querySelectorAll('.factory-list .factory-card')]
    const card = cards.find(c => c.innerText.split('\n')[0].trim().startsWith(n.slice(0, 14)))
    card?.querySelector('.v-card')?.click()
  }, name)
  await sleep(2000)
}
await gotoFactory('Copper Basics')

const cardChips = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.main-content .v-card[id]')]
  const card = cards.find(c => c.querySelector('.factory-name')?.value === 'Copper Basics')
  if (!card) return null
  return {
    problem: card.classList.contains('problem'),
    chips: [...card.querySelectorAll('.status-chips .v-chip')].map(c => c.innerText.trim()),
    syncChips: [...card.querySelectorAll('.v-chip')].filter(c => /Out of sync/i.test(c.innerText)).length,
  }
})
check('factory card is red', cardChips?.problem === true)
check('factory card shows the status chip', (cardChips?.chips || []).some(c => /Shortage/i.test(c)),
  JSON.stringify(cardChips?.chips))

// --- 4. section header shows the detailed chip ---------------------------
const section = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.main-content .v-card[id]')]
  const card = cards.find(c => c.querySelector('.factory-name')?.value === 'Copper Basics')
  const sat = card?.querySelector('[id$="-satisfaction"]')
  if (!sat) return null
  const h2 = sat.querySelector('h2')
  return {
    anchorPresent: true,
    headingClass: h2?.className,
    headingRed: h2?.classList.contains('text-red'),
    chips: [...sat.querySelectorAll('.status-chips .v-chip')].map(c => c.innerText.trim()),
    icons: sat.querySelectorAll('.status-chips .v-chip img, .status-chips .v-chip .v-img').length,
  }
})
check('satisfaction anchor exists', section?.anchorPresent === true)
check('satisfaction heading is red', section?.headingRed === true, section?.headingClass)
check('satisfaction header carries a detailed chip', (section?.chips || []).length > 0,
  JSON.stringify(section?.chips))
check('detailed chip renders item icons', (section?.icons || 0) > 0, `icons=${section?.icons}`)

// --- 5. out of sync = amber + chip, sync cell untouched ------------------
// The demo plan ships one factory already marked built and since drifted, so the amber tier is
// observable without driving the sync flow.
const targetName = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.factory-list .factory-card')]
  const card = cards.find(c => /Out of sync/i.test(c.innerText))
  return card ? card.innerText.split('\n')[0].trim() : null
})
check('demo plan has an out-of-sync factory to observe', !!targetName, String(targetName))

const drifted = await rowInfo(targetName)
check('drifted factory paints amber', drifted?.hasWarning === true,
  `${targetName}: ${drifted?.classes}`)
check('drifted factory shows an Out of sync chip',
  (drifted?.chips || []).some(c => /Out of sync/i.test(c)), JSON.stringify(drifted?.chips))
check('amber is not also red', drifted?.hasProblem === false)

const syncCell = await page.evaluate(n => {
  const cards = [...document.querySelectorAll('.factory-list .factory-card')]
  const card = cards.find(c => c.innerText.split('\n')[0].trim().startsWith(n.slice(0, 14)))
  return !!card?.querySelector('.sync-state')
}, targetName)
check('sidebar sync cell still present', syncCell === true)

// The card's own header must NOT duplicate it — that bar already has the full sync control.
await gotoFactory(targetName)
const cardSync = await page.evaluate(n => {
  const cards = [...document.querySelectorAll('.main-content .v-card[id]')]
  const card = cards.find(c => c.querySelector('.factory-name')?.value?.startsWith(n.slice(0, 14)))
  if (!card) return null
  return {
    total: [...card.querySelectorAll('.v-chip')].filter(c => /Out of sync/i.test(c.innerText)).length,
    inStatusChips: [...card.querySelectorAll('.status-chips .v-chip')].filter(c => /Out of sync/i.test(c.innerText)).length,
  }
}, targetName)
check('card header shows exactly one out-of-sync chip', cardSync?.total === 1, JSON.stringify(cardSync))
check('the status chip row does not duplicate it', cardSync?.inStatusChips === 0, JSON.stringify(cardSync))

// --- 6. the row actually grows -------------------------------------------
const growth = await page.evaluate(async () => {
  // A row that actually carries a chip, so the measurement is the chip's height and not just
  // the wrapper's padding. Statistics / Summary jump-links share .factory-card but have no chips.
  const card = [...document.querySelectorAll('.factory-list .factory-card')]
    .find(c => c.querySelector('.status-chips.open .v-chip'))
  if (!card) return { skipped: true }
  const wrap = card.querySelector('.status-chips')
  const open = card.getBoundingClientRect().height
  // Retract it and let the transition settle, then measure the closed height.
  wrap.classList.remove('open')
  await new Promise(resolve => setTimeout(resolve, 500))
  const closed = card.getBoundingClientRect().height
  wrap.classList.add('open')
  await new Promise(resolve => setTimeout(resolve, 500))
  const reopened = card.getBoundingClientRect().height
  return { open, closed, reopened }
})
check('a chip visibly grows the entry, and retracting restores its height',
  !growth.skipped && growth.open > growth.closed + 10 && growth.reopened === growth.open,
  JSON.stringify(growth))

// --- 7. collision screenshot ---------------------------------------------
await page.screenshot({ path: `${SHOTS}/sidebar-states.png`, clip: { x: 0, y: 100, width: 340, height: 700 } })

// --- 8. Factories Summary rows -------------------------------------------
await page.evaluate(() => {
  const el = document.querySelector('#factory-summary')
  el?.scrollIntoView()
})
await sleep(2500)
const summary = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.summary-table tbody tr')]
  return {
    total: rows.length,
    problem: rows.filter(r => r.classList.contains('problem')).length,
    warning: rows.filter(r => r.classList.contains('warning')).length,
  }
})
check('summary table paints a problem row', summary.problem > 0, JSON.stringify(summary))
check('summary table paints a warning row', summary.warning > 0, JSON.stringify(summary))

console.log('\npageerrors:', errors.length ? errors.slice(0, 5) : 'none')
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
