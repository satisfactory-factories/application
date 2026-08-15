// The pre-v0.6 migration, end to end and in a real browser: a returning user with a plan built
// before extraction existed is met by the v0.6 deck, runs the wizard from it, and comes back to
// the deck with a plan that is actually fixed. Run the dev server first, then:
//   node testing/browser/migration.e2e.mjs
import puppeteer from 'puppeteer-core'

const BASE = `http://localhost:${process.env.PORT || 3000}`
const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  headless: 'new',
  args: ['--disable-background-timer-throttling', '--window-size=1600,1200'],
  defaultViewport: { width: 1600, height: 1200 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()) })
const notFound = []
page.on('response', r => { if (r.status() === 404) notFound.push(r.url()) })

// Clicked in-page rather than through the mouse: dialogs scroll their own container, so a real
// mouse click misses anything below the fold.
const clickByText = async (selector, text) => page.evaluate((sel, t) => {
  const el = [...document.querySelectorAll(sel)].find(e =>
    e.textContent.trim().includes(t) && e.offsetParent !== null)
  if (!el) return false
  el.click()
  return true
}, selector, text)

const closeAnyOverlay = async () => {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.v-overlay__content .v-card-title .v-btn')].pop()
    btn?.click()
  })
  await sleep(400)
}

const splashState = () => page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('.v-overlay__content .v-card')]
  const splash = dialogs.find(d => d.textContent.includes("What's new in Beta v0.6"))
  if (!splash) return { open: false }
  const counter = splash.querySelector('.slide-counter')?.textContent?.trim() ?? ''
  return {
    open: true,
    slide: counter,
    hasClose: !!splash.querySelector('.v-card-title .v-btn'),
    banner: splash.textContent.includes('Action needed'),
    wizardBtn: splash.textContent.includes('Run the wizard'),
    scrollTop: splash.querySelector('.v-card-text')?.scrollTop ?? -1,
  }
})

// Matched on the dialog's own title, not anywhere in its text: slide 1 of the deck names the
// wizard too, so a body-text match reports the deck as the wizard.
const wizardOpen = () => page.evaluate(() =>
  [...document.querySelectorAll('.v-overlay__content .v-card .v-card-title')].some(t =>
    t.textContent.includes('Raw Resources Wizard') && t.offsetParent !== null))

// --- 1. Put a pre-v0.6 plan in local storage, the way a returning user already has one. The
// template is loaded first and left unanswered, then the deck is re-armed and the page reloaded:
// that is the real entry point, a legacy plan present before the app boots.
await page.goto(BASE, { waitUntil: 'networkidle2' })
await page.evaluate(() => {
  localStorage.setItem('dismissed-introduction', 'true')
  localStorage.removeItem('seenV6Splash')
})
await page.goto(BASE, { waitUntil: 'networkidle2' })
await sleep(2500)
if ((await splashState()).open) await closeAnyOverlay()

await clickByText('.v-btn', 'Templates')
await sleep(700)
const loaded = await clickByText('.v-btn', '#503: Pre-mining plan')
check('the #503 template button is reachable', loaded)
await sleep(4000)
await page.evaluate(() => localStorage.removeItem('seenV6Splash'))

const stored = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('factoryTabs') || '{}')
  const tab = Object.values(raw.tabs ?? raw)[0] ?? {}
  return { plannerVersion: tab.plannerVersion ?? null, factories: (tab.factories ?? []).length }
})
check('the stored plan is unstamped, as a pre-v0.6 plan is', stored.plannerVersion === null, JSON.stringify(stored))

// --- 2. Boot with that plan present: this is what a returning user gets.
await page.reload({ waitUntil: 'networkidle2' })
await sleep(4000)

// --- 3. The deck should take over, locked, with the banner and the wizard offer.
let state = await splashState()
check('the v6 deck opens after the legacy plan loads', state.open, JSON.stringify(state))
check('it opens on slide 1', state.slide === '1 / 7', state.slide)
check('it carries the action-needed banner', !!state.banner)
check('it offers the wizard', !!state.wizardBtn)
check('it has no close button while unanswered', state.hasClose === false)

// The migration prompt must not be stacked behind it.
const promptToo = await page.evaluate(() =>
  [...document.querySelectorAll('.v-overlay__content .v-card')].filter(d =>
    d.textContent.includes('no longer assumed')).length)
check('only one dialog says it (the notice deferred to the deck)', promptToo <= 1, `${promptToo} dialogs`)

// --- 4. Run the wizard from the deck.
const ranWizard = await clickByText('.v-btn', 'Run the wizard')
check('the Run the wizard button clicks', ranWizard)
await sleep(2500)
check('the deck steps aside', (await splashState()).open === false)
check('the wizard opens', await wizardOpen())

// --- 5. Apply it.
const rowInfo = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.v-overlay__content .v-card')].find(d => d.querySelector('.v-card-title')?.textContent.includes('Raw Resources Wizard'))
  return { rows: card?.querySelectorAll('tbody tr').length ?? 0, nothingToFix: !!card?.textContent.includes('Nothing to fix') }
})
check('the wizard has rows to fix', rowInfo.rows > 0 && !rowInfo.nothingToFix, JSON.stringify(rowInfo))

const reviewed = await clickByText('.v-card-actions .v-btn', 'Review')
check('Review clicks', reviewed)
await sleep(1500)
const summary = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.v-overlay__content .v-card')].find(d => d.textContent.includes('Raw Resources Wizard'))
  return (card?.textContent || '').replace(/\s+/g, ' ').match(/This will:.{0,200}/)?.[0] ?? ''
})
console.log('      summary:', summary)
const applied = await clickByText('.v-card-actions .v-btn', 'Apply')
check('Apply clicks', applied)
await sleep(8000)

// --- 6. The deck comes back where it left off, now closable.
state = await splashState()
check('the deck returns after the wizard closes', state.open, JSON.stringify(state))
check('it returns to the slide it left', state.slide === '1 / 7', state.slide)
check('it is closable now the question is answered', state.hasClose === true)
check('the wizard is gone', (await wizardOpen()) === false)

// --- 7. Walk the deck: scroll resets between slides, and it ends on Got it!
await page.evaluate(() => {
  const body = [...document.querySelectorAll('.v-overlay__content .v-card')]
    .find(d => d.textContent.includes("What's new in Beta v0.6"))?.querySelector('.v-card-text')
  if (body) body.scrollTop = body.scrollHeight
})
await sleep(300)
const scrolledBefore = (await splashState()).scrollTop
await clickByText('.v-card-actions .v-btn', 'Mining')
await sleep(600)
state = await splashState()
check('the next slide opens at the top', state.scrollTop === 0, `was ${scrolledBefore}, now ${state.scrollTop}`)

// The Next / Got it! button is the last action on every slide.
const slidesSeen = []
for (let i = 0; i < 8 && (await splashState()).open; i++) {
  slidesSeen.push((await splashState()).slide)
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.v-overlay__content .v-card')]
      .find(d => d.textContent.includes("What's new in Beta v0.6"))
    const btns = [...(card?.querySelectorAll('.v-card-actions .v-btn') ?? [])]
    btns[btns.length - 1]?.click()
  })
  await sleep(600)
}
console.log('      slides walked:', slidesSeen.join(' -> '))
check('the deck can be walked to the end and closed', (await splashState()).open === false)

// --- 8. The plan is actually fixed.
const planState = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('factoryTabs') || '{}')
  const tab = Object.values(raw.tabs ?? raw)[0] ?? {}
  const factories = tab.factories ?? []
  return {
    plannerVersion: tab.plannerVersion ?? null,
    factories: factories.length,
    problems: factories.filter(f => f.hasProblem).map(f => f.name),
    rawSupplied: factories.flatMap(f => Object.entries(f.parts ?? {})
      .filter(([, p]) => p.isRaw && p.amountSuppliedViaRaw > 0)
      .map(([id]) => `${f.name}:${id}`)),
  }
})
check('the plan is stamped as answered', planState.plannerVersion !== null, String(planState.plannerVersion))
check('no factory is left with a problem', planState.problems.length === 0, planState.problems.join(', '))
check('nothing is still supplied out of thin air', planState.rawSupplied.length === 0, planState.rawSupplied.join(', '))

// --- 9. A reload does not re-open the deck or the notice.
await page.reload({ waitUntil: 'networkidle2' })
await sleep(3500)
check('the deck stays shut on the next load', (await splashState()).open === false)
const noticeBack = await page.evaluate(() =>
  [...document.querySelectorAll('.v-overlay__content .v-card')].some(d => d.textContent.includes('no longer assumed')))
check('the notice does not come back', noticeBack === false)

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
const missing = [...new Set(notFound)].filter(u => !u.includes(':3001'))
check('nothing 404s', missing.length === 0, missing.slice(0, 5).join(' | '))

// ---- Edge cases, each on its own page so one cannot leave state for the next.
const newPage = async () => {
  const p = await browser.newPage()
  p.on('pageerror', e => console.log('   PAGEERROR', String(e).slice(0, 160)))
  return p
}
const click = (p, sel, text) => p.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim().includes(t) && e.offsetParent !== null)
  if (!el) return false
  el.click()
  return true
}, sel, text)
const splashStateOf = p => p.evaluate(() => {
  const splash = [...document.querySelectorAll('.v-overlay__content .v-card')]
    .find(d => d.querySelector('.v-card-title')?.textContent.includes("What's new in Beta v0.6"))
  if (!splash || splash.offsetParent === null) return { open: false }
  return {
    open: true,
    slide: splash.querySelector('.slide-counter')?.textContent?.trim() ?? '',
    hasClose: !!splash.querySelector('.v-card-title .v-btn'),
    banner: splash.textContent.includes('Action needed'),
  }
})
const wizardOpenOn = p => p.evaluate(() =>
  [...document.querySelectorAll('.v-overlay__content .v-card .v-card-title')]
    .some(t => t.textContent.includes('Raw Resources Wizard') && t.offsetParent !== null))

// Puts an unanswered pre-v0.6 plan in local storage and boots the app with it present.
const seedLegacyPlan = async (p, startPath = '/') => {
  await p.goto(BASE, { waitUntil: 'networkidle2' })
  await p.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('dismissed-introduction', 'true')
  })
  await p.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(2500)
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('.v-overlay__content .v-card-title .v-btn')].pop()
    b?.click()
  })
  await sleep(500)
  await click(p, '.v-btn', 'Templates')
  await sleep(700)
  await click(p, '.v-btn', '#503: Pre-mining plan')
  await sleep(4000)
  await p.evaluate(() => localStorage.removeItem('seenV6Splash'))
  await p.goto(BASE + startPath, { waitUntil: 'networkidle2' })
  await sleep(4000)
}

// --- Edge 1: the deck locks on a page that does not mount the wizard.
{
  const page = await newPage()
  await seedLegacyPlan(page, '/changelog')
  const state = await splashStateOf(page)
  console.log('      deck on /changelog:', JSON.stringify(state))
  // Landing straight on another page must not spend the one-time showing.
  check('[changelog] nothing is marked seen off the planner',
    (await page.evaluate(() => localStorage.getItem('seenV6Splash'))) === null)
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/')
    if (link) link.click()
    else window.location.href = '/'
  })
  await sleep(5000)
  const onPlanner = await splashStateOf(page)
  check('[changelog] the warning still finds them on the planner', onPlanner.open && onPlanner.banner, JSON.stringify(onPlanner))
  await page.close()
}

// --- Edge 2: the tab is closed on the locked slide without answering.
{
  const page = await newPage()
  await seedLegacyPlan(page)
  check('[reload] the deck is locked to begin with', (await splashStateOf(page)).hasClose === false)
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(4500)
  const state = await splashStateOf(page)
  check('[reload] leaving without answering asks again next load', state.open && state.banner && state.hasClose === false, JSON.stringify(state))
  await page.close()
}

// --- Edge 3: cancelling the wizard rather than applying.
{
  const page = await newPage()
  await seedLegacyPlan(page)
  await click(page, '.v-btn', 'Run the wizard')
  await sleep(2500)
  check('[cancel] the wizard is open', await wizardOpenOn(page))
  await click(page, '.v-card-actions .v-btn', 'Cancel')
  await sleep(2000)
  const state = await splashStateOf(page)
  check('[cancel] the deck still comes back', state.open, JSON.stringify(state))
  check('[cancel] and is closable, the question having been answered', state.hasClose === true)
  const stamped = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('factoryTabs') || '{}')
    const tab = Object.values(raw.tabs ?? raw)[0] ?? {}
    return tab.plannerVersion ?? null
  })
  check('[cancel] the plan counts as answered, not as fixed', stamped !== null, String(stamped))
  await page.close()
}

// --- Edge 4: "I'll sort it myself".
{
  const page = await newPage()
  await seedLegacyPlan(page)
  await click(page, '.v-btn', "I'll sort it myself")
  await sleep(1000)
  const state = await splashStateOf(page)
  check('[decline] the deck stays open with the tour still to walk', state.open, JSON.stringify(state))
  console.log('      closable after declining:', state.hasClose)
  for (let i = 0; i < 8 && (await splashStateOf(page)).open; i++) {
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('.v-overlay__content .v-card')]
        .find(d => d.querySelector('.v-card-title')?.textContent.includes("What's new in Beta v0.6"))
      const btns = [...(card?.querySelectorAll('.v-card-actions .v-btn') ?? [])]
      btns[btns.length - 1]?.click()
    })
    await sleep(500)
  }
  check('[decline] the tour can be walked out of', (await splashStateOf(page)).open === false)
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(4500)
  const back = await splashStateOf(page)
  const noticeBack = await page.evaluate(() =>
    [...document.querySelectorAll('.v-overlay__content .v-card')].some(d =>
      d.textContent.includes('no longer assumed') && d.offsetParent !== null))
  check('[decline] neither the deck nor the notice nags again', back.open === false && !noticeBack,
    `deck ${back.open}, notice ${noticeBack}`)
  await page.close()
}

// --- Edge 5: a second legacy plan in another tab, after the deck has been seen.
{
  const page = await newPage()
  await seedLegacyPlan(page)
  await click(page, '.v-btn', "I'll sort it myself")
  await sleep(800)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.v-overlay__content .v-card-title .v-btn')].pop()
    b?.click()
  })
  await sleep(800)
  // A fresh tab carrying another pre-v0.6 plan: the deck is spent, so the notice must speak.
  await page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem('factoryTabs') || '[]')
    const copy = JSON.parse(JSON.stringify(tabs[0]))
    copy.id = 'second-tab'
    copy.name = 'Second legacy plan'
    delete copy.plannerVersion
    tabs.push(copy)
    localStorage.setItem('factoryTabs', JSON.stringify(tabs))
    localStorage.setItem('currentFactoryTabIndex', String(tabs.length - 1))
  })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(4500)
  const noticeShown = await page.evaluate(() =>
    [...document.querySelectorAll('.v-overlay__content .v-card')].some(d =>
      d.textContent.includes('no longer assumed') && d.offsetParent !== null))
  const tabInfo = await page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem('factoryTabs') || '[]')
    const i = Number(localStorage.getItem('currentFactoryTabIndex') ?? 0)
    return { tabs: tabs.length, current: i, name: tabs[i]?.name, version: tabs[i]?.plannerVersion ?? null }
  })
  check('[second plan] the notice speaks for a plan the deck never covered', noticeShown, JSON.stringify(tabInfo))
  await page.close()
}

await browser.close()
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
