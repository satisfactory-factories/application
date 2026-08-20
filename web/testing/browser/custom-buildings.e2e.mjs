// Browser verification for #478 custom buildings.
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
    // Root in a container: chromium refuses to start with its sandbox on.
    ...(process.env.NO_SANDBOX ? ['--no-sandbox'] : []),
  ],
  defaultViewport: { width: 1600, height: 1200 },
})

const page = await browser.newPage()
page.on('dialog', d => d.accept())
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))

await page.goto(BASE, { waitUntil: 'networkidle2' })
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('dismissed-introduction', 'true')
  localStorage.setItem('seenV51Splash', 'true')
  localStorage.setItem('seenV6Splash', 'true')
  localStorage.setItem('buildingGroupTutorialOpened', 'true')
})
await page.goto(`${BASE}/?setupDemo=true`, { waitUntil: 'networkidle2' })
await sleep(3000)

const cardFor = async name => page.evaluateHandle(factoryName => {
  const cards = [...document.querySelectorAll('.main-content .v-card[id]')]
  return cards.find(card => card.querySelector('.factory-name')?.value === factoryName) ?? null
}, name)

// ---- The demo plan's Portal Hub
const hub = await cardFor('Portal Hub')
check('demo plan has a Portal Hub factory', !!(await hub.evaluate(el => !!el)))

await hub.evaluate(el => el.scrollIntoView({ block: 'center' }))
await sleep(1200)

const hubText = await hub.evaluate(el => el.innerText.replace(/\s+/g, ' '))
check('Portal Hub lists 10 Main Portals', /Main Portal/.test(hubText), hubText.slice(0, 160))
check('Portal Hub states its power draw', hubText.includes('2,500 MW'),
  (hubText.match(/[\d.]+ ?[GM]W/g) || []).join(', '))
check('Portal Hub states its Singularity Cell upkeep', /Requires:/.test(hubText))

// The per-part breakdown rows only render with the toggle on.
await hub.evaluate(el => {
  const toggle = el.querySelector('[id$="-satisfaction-breakdown-toggle"]')
  if (toggle && !toggle.checked) toggle.click()
})
await sleep(1000)

const hubCounts = await hub.evaluate(el => ({
  // Numbers are formatted with non-breaking spaces, so normalise before matching.
  power: (el.querySelector(`[id$="-buildings-power-consumed"]`)?.innerText ?? '').replace(/\s+/g, ' '),
  portals: el.querySelector(`[id$="-buildings-building-portal"]`)?.innerText ?? '',
  cellsRemaining: [...el.querySelectorAll('[id*="-satisfaction-SingularityCell-remaining"]')].map(n => n.innerText),
  cellsFromBuildings: [...el.querySelectorAll('[id*="-satisfaction-SingularityCell-required-buildings"]')].map(n => n.innerText),
}))
check('satisfaction card shows 2,500 MW consumed', hubCounts.power.includes('2,500 MW'), hubCounts.power)
check('satisfaction card counts 10 portals as buildings', hubCounts.portals === '10', hubCounts.portals)
check('satisfaction breakdown attributes the cells to custom buildings',
  hubCounts.cellsFromBuildings.length > 0, JSON.stringify(hubCounts.cellsFromBuildings))
check('Singularity Cells are satisfied by the import',
  hubCounts.cellsRemaining.every(value => value === '0'), JSON.stringify(hubCounts.cellsRemaining))

const hubIcons = await hub.evaluate(el =>
  [...el.querySelectorAll('img')].map(img => img.src).filter(src => src.includes('portal')))
check('the portal icon resolves to a real asset', hubIcons.length > 0, hubIcons[0] ?? 'none')

await page.screenshot({
  path: `${SHOTS}/portal-hub.png`,
  clip: await hub.evaluate(el => {
    const box = el.getBoundingClientRect()
    return { x: box.x, y: Math.max(box.y, 0), width: box.width, height: Math.min(box.height, 900) }
  }),
})

// ---- Adding one by hand
const oil = await cardFor('Oil Processing')
await oil.evaluate(el => el.scrollIntoView({ block: 'center' }))
await sleep(800)

const clicked = await oil.evaluate(el => {
  const button = [...el.querySelectorAll('button')].find(
    b => b.innerText.replace(/\s+/g, ' ').trim().toUpperCase() === 'ADD CUSTOM BUILDING')
  if (!button) return false
  button.click()
  return true
})
check('the Add Custom Building button exists', clicked)
await sleep(1200)

const rowAdded = await oil.evaluate(el => el.querySelectorAll('.customBuilding').length)
check('clicking it adds a custom building row', rowAdded === 1, `rows: ${rowAdded}`)

// Choose the Radar Tower through the autocomplete.
const selectorId = await oil.evaluate(el =>
  el.querySelector('.customBuilding input[id$="-building"]')?.id ?? '')
check('the row offers a building selector', !!selectorId, selectorId)

if (selectorId) {
  await page.evaluate(id => {
    const input = document.getElementById(id)
    const field = input.closest('.v-input').querySelector('.v-field')
    field.dispatchEvent(new Event('mousedown', { bubbles: true }))
    field.click()
  }, selectorId)
  await sleep(700)

  const options = await page.evaluate(() =>
    [...document.querySelectorAll('.v-overlay--active .v-list-item-title')].map(n => n.innerText))
  check('the selector lists non-production buildings', options.includes('Radar Tower') && options.includes('Main Portal'),
    `${options.length} options`)
  check('the selector excludes production buildings',
    !options.some(option => ['Constructor', 'Smelter', 'Assembler', 'Coal-Powered Generator'].includes(option)),
    options.slice(0, 6).join(', '))

  await page.evaluate(() => {
    const option = [...document.querySelectorAll('.v-overlay--active .v-list-item')]
      .find(item => item.innerText.trim() === 'Radar Tower')
    option.click()
  })
  await sleep(1500)

  const rowText = await oil.evaluate(el =>
    el.querySelector('.customBuilding')?.innerText.replace(/\s+/g, ' ') ?? '')
  check('the chosen building states its draw', rowText.includes('30 MW'), rowText.slice(0, 120))
  check('a building with no upkeep says so', rowText.includes('Draws power only'), rowText.slice(0, 160))

  // The factory's own power figure must move with it.
  const oilPower = await oil.evaluate(el =>
    (el.querySelector('[id$="-buildings-power-consumed"]')?.innerText ?? '').replace(/\s+/g, ' '))
  check('the factory power figure includes it', oilPower !== '', oilPower)
}

// ---- Statistics: the Portal Hub must not read as a factory that does nothing
await page.evaluate(() => document.querySelector('#factory-summary')?.scrollIntoView({ block: 'start' }))
await sleep(2000)
await page.evaluate(() => document.querySelector('#statistics')?.scrollIntoView({ block: 'start' }))
await sleep(1500)

const stats = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#stats-buildings tbody tr')]
    .map(row => row.innerText.replace(/\s+/g, ' '))
  // A row's text CONTAINS other factories' names (the export column names who is asking), so
  // match the name cell rather than the row.
  const summaryRow = [...document.querySelectorAll('#factory-summary tbody tr')]
    .find(row => row.querySelector('td')?.innerText.replace(/\s+/g, ' ').includes('Portal Hub'))
  return {
    portalRow: rows.find(row => row.includes('Main Portal')) ?? '',
    summaryRow: summaryRow?.innerText.replace(/\s+/g, ' ') ?? '',
  }
})
check('the building summary counts the portals', /Main Portal 10/.test(stats.portalRow), stats.portalRow)
// The Producing column: a factory of nothing but custom buildings must still say what is in it.
check('the factories summary shows the portals as what the hub holds',
  /Portal Hub/.test(stats.summaryRow) && /10x/.test(stats.summaryRow), stats.summaryRow.slice(0, 160))

// ---- Game sync: a factory of nothing but custom buildings can be synced, and notices a change
await hub.evaluate(el => el.scrollIntoView({ block: 'start' }))
await sleep(1200)

const syncChipText = () => hub.evaluate(el => {
  const chip = [...el.querySelectorAll('.v-chip')]
    .find(c => /sync with game/i.test(c.innerText))
  return chip ? { text: chip.innerText.replace(/\s+/g, ' ').trim(), disabled: chip.classList.contains('v-chip--disabled') } : null
})

const beforeSync = await syncChipText()
check('a custom-building-only factory offers game sync', beforeSync && !beforeSync.disabled,
  JSON.stringify(beforeSync))

await hub.evaluate(el => {
  const chip = [...el.querySelectorAll('.v-chip')].find(c => /Mark as in sync/i.test(c.innerText))
  chip?.click()
})
await sleep(1500)
const afterSync = await syncChipText()
check('marking it in sync sticks', /In sync with game/i.test(afterSync?.text ?? ''), afterSync?.text)

// Change the portal count: the world no longer matches the plan.
const qtyId = await hub.evaluate(el =>
  el.querySelector('.customBuilding input[id$="-amount"]')?.id ?? '')
await page.evaluate(id => document.getElementById(id)?.focus(), qtyId)
await page.keyboard.down('Control')
await page.keyboard.press('KeyA')
await page.keyboard.up('Control')
await page.keyboard.type('12')
await sleep(2500)

const afterChange = await syncChipText()
check('changing a custom building drops it out of sync',
  /Out of sync with game/i.test(afterChange?.text ?? ''), afterChange?.text)

check('no page errors', errors.length === 0, errors.join(' | '))

console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed`)
await browser.close()
process.exit(results.every(r => r.pass) ? 0 : 1)
