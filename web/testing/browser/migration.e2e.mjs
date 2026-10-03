// The pre-v0.6 migration, end to end and in a real browser: a returning user with a plan built
// before extraction existed is met by the raw-resources notice, runs the wizard from it, and is
// left with a plan that is actually fixed.
//
// The notice is `components/planner/RawMigrationPrompt.vue`, raised off `showRawBreakingNotice`
// in the app store and answered — either way — by `dismissRawBreakingNotice()`, which stamps
// `plannerVersion` on the tab. Answering therefore belongs to the PLAN, not to the browser, so
// every scenario here re-arms by seeding an unstamped plan rather than by clearing a flag.
//
// The release decks are seeded as seen throughout, so the notice speaks for itself; the last
// scenario is the one that boots with them unseen and checks how the two share a first load.
//
// Run the dev server first, then:
//   cd web && VITE_ENV=dev pnpm exec vite --port 3005 --strictPort
//   PORT=3005 node testing/browser/migration.e2e.mjs
import puppeteer from 'puppeteer-core'

const BASE = `http://localhost:${process.env.PORT || 3000}`
const CHROMIUM = process.env.CHROMIUM || '/usr/bin/chromium'
const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Fixed sleeps went stale as the load got slower: poll instead, so a busy machine costs time
// rather than a false failure.
const waitFor = async (predicate, timeout = 20000) => {
  const deadline = Date.now() + timeout
  for (;;) {
    if (await predicate()) return true
    if (Date.now() > deadline) return false
    await sleep(250)
  }
}

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
  defaultViewport: { width: 1600, height: 1200 },
})

// Clicked in-page rather than through the mouse: dialogs scroll their own container, so a real
// mouse click misses anything below the fold.
const click = (p, selector, text) => p.evaluate((sel, t) => {
  const el = [...document.querySelectorAll(sel)].find(e =>
    e.textContent.trim().includes(t) && e.offsetParent !== null)
  if (!el) return false
  el.click()
  return true
}, selector, text)

// Everything the notice puts in front of the user. Matched on its own heading rather than on
// "Action needed", which is only the kicker above it and is a phrase the v0.6 deck uses too.
const promptStateOf = p => p.evaluate(() => {
  const card = [...document.querySelectorAll('.v-overlay__content .v-card')]
    .find(d => d.textContent.includes('Raw resource migration required'))
  if (!card || card.offsetParent === null) return { open: false }
  const label = el => el.textContent.replace(/\s+/g, ' ').trim()
  return {
    open: true,
    headline: label(card.querySelector('.action-headline') ?? card),
    heading: label(card.querySelector('h3') ?? card),
    wizardBtn: !!card.querySelector('#raw-notice-wizard'),
    dismissBtn: !!card.querySelector('#raw-notice-dismiss'),
    // The notice is deliberately not persistent: closing it has to leave a usable plan.
    closable: !!card.querySelector('.v-card-title .app-dialog-close'),
    examples: [...card.querySelectorAll('.v-btn')].map(label)
      .filter(t => ['Miners', 'Resource wells', 'Water'].includes(t)),
    image: card.querySelector('img')?.getAttribute('src') ?? '',
  }
})

// Matched on the dialog's own title, not anywhere in its text: the notice names the wizard too,
// so a body-text match reports the notice as the wizard.
const wizardOpenOn = p => p.evaluate(() =>
  [...document.querySelectorAll('.v-overlay__content .v-card .v-card-title')].some(t =>
    t.textContent.includes('Raw Resources Wizard') && t.offsetParent !== null))

// Matched on the deck's own title bar: the v0.7 deck names the v0.6 one in its back-link, so a
// body-text match reports one as the other. Returns which release deck is up, or null.
const deckOpenOn = p => p.evaluate(() => {
  const deck = [...document.querySelectorAll('.v-overlay__content .v-card')].find(d =>
    /What's new in Beta v0\.\d/.test(d.querySelector('.v-card-title')?.textContent ?? '') &&
    d.offsetParent !== null)
  return deck?.querySelector('.v-card-title')?.textContent.trim().replace(/\s+/g, ' ') ?? null
})

const tabsOf = p => p.evaluate(() => {
  const tabs = JSON.parse(localStorage.getItem('factoryTabs') || '[]')
  return tabs.map(t => ({
    name: t.name,
    plannerVersion: t.plannerVersion ?? null,
    factories: (t.factories ?? []).length,
  }))
})

// --- The plan under test: the #503 template, loaded once through the UI the way it ships, then
// stripped of its stamp. Every scenario below is booted from this rather than re-driving the
// sidebar, so each one starts from an identical pre-v0.6 plan.
const capturePage = await browser.newPage()
await capturePage.goto(BASE, { waitUntil: 'networkidle2' })
await capturePage.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('dismissed-introduction', 'true')
  localStorage.setItem('seenV51Splash', 'true')
  localStorage.setItem('seenV6Splash', 'true')
  localStorage.setItem('seenV7Splash', 'true')
})
await capturePage.goto(BASE, { waitUntil: 'networkidle2' })
await waitFor(() => capturePage.evaluate(() => !!document.querySelector('.v-btn')))
await click(capturePage, '.v-btn', 'Templates')
await sleep(700)
const loaded = await click(capturePage, '.v-btn', '#503: Pre-mining plan')
check('the #503 template button is reachable', loaded)
await waitFor(() => capturePage.evaluate(() =>
  (JSON.parse(localStorage.getItem('factoryTabs') || '[]')[0]?.factories ?? []).length > 0))
const captured = await capturePage.evaluate(() =>
  JSON.parse(localStorage.getItem('factoryTabs') || '[]')[0] ?? null)
check('the template is a plan the change can have broken',
  (captured?.factories?.length ?? 0) > 0 && !captured?.plannerVersion,
  JSON.stringify({ factories: captured?.factories?.length, plannerVersion: captured?.plannerVersion ?? null }))
await capturePage.close()

const legacyTab = JSON.parse(JSON.stringify(captured))
delete legacyTab.plannerVersion

// Seeded before the app boots rather than written into a live page: the planner persists its
// in-memory plan on `pagehide`, so anything written to local storage from a loaded page is
// clobbered by the navigation that was meant to pick it up.
const newPage = async ({ tabs = [legacyTab], index = 0, decksSeen = true } = {}) => {
  const p = await browser.newPage()
  p.on('dialog', d => { console.log('   DIALOG', d.type(), d.message().slice(0, 100)); d.accept().catch(() => {}) })
  p.on('pageerror', e => console.log('   PAGEERROR', String(e).slice(0, 160)))
  await p.evaluateOnNewDocument((seed, i, seen) => {
    // Fires on every navigation, and a reload here is a scenario in its own right — a second
    // seeding would answer the question the reload is asking. Sentinel in sessionStorage, which
    // survives the reload but not the tab.
    if (sessionStorage.getItem('migration-e2e-seeded')) return
    sessionStorage.setItem('migration-e2e-seeded', 'true')
    localStorage.setItem('dismissed-introduction', 'true')
    // Every release adds a key, and suppressing one only reveals the next.
    for (const key of ['seenV51Splash', 'seenV6Splash', 'seenV7Splash']) {
      if (seen) localStorage.setItem(key, 'true')
      else localStorage.removeItem(key)
    }
    localStorage.setItem('factoryTabs', JSON.stringify(seed))
    localStorage.setItem('currentFactoryTabIndex', String(i))
  }, tabs, index, decksSeen)
  return p
}

const bootLegacyPlan = async (options = {}) => {
  const p = await newPage(options)
  await p.goto(BASE + (options.path ?? '/'), { waitUntil: 'networkidle2' })
  return p
}

// ============================================================================
// 1. A returning user opens the planner with a pre-v0.6 plan already in local storage.
const page = await bootLegacyPlan()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()) })
const notFound = []
page.on('response', r => { if (r.status() === 404) notFound.push(r.url()) })

check('the notice speaks for a plan built before extraction existed',
  await waitFor(async () => (await promptStateOf(page)).open))
const state = await promptStateOf(page)
check('it leads on the action needed, about this plan', state.headline === 'Action needed', state.headline)
check('and names the migration', state.heading === 'Raw resource migration required', state.heading)
check('it offers the wizard', state.wizardBtn)
check('and the answer that is not the wizard', state.dismissBtn)
check('it can be closed, since dismissing leaves a usable plan', state.closable)
check('it shows what extraction looks like', state.examples.join(', ') === 'Miners, Resource wells, Water', state.examples.join(', '))
check('it opens on the miners example', state.image.includes('miners'), state.image)

// The examples are the notice's one moving part.
await click(page, '.v-btn', 'Resource wells')
await sleep(400)
check('picking another example swaps the picture',
  (await promptStateOf(page)).image.includes('resource-well'), (await promptStateOf(page)).image)

// The deck is spent, so nothing is stacked in front of the notice.
check('no release deck is stacked over it', (await deckOpenOn(page)) === null)

// --- 2. Leaving without answering asks again on the next load: the plan is still unanswered.
await page.reload({ waitUntil: 'networkidle2' })
check('leaving without answering asks again next load',
  await waitFor(async () => (await promptStateOf(page)).open))

// --- 3. Run the wizard from the notice.
const ranWizard = await click(page, '.v-btn', 'Run the wizard')
check('the Run the wizard button clicks', ranWizard)
check('the notice steps aside', await waitFor(async () => (await promptStateOf(page)).open === false))
check('the wizard opens', await waitFor(() => wizardOpenOn(page)))

// --- 4. Apply it.
const rowInfo = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.v-overlay__content .v-card')]
    .find(d => d.querySelector('.v-card-title')?.textContent.includes('Raw Resources Wizard'))
  return { rows: card?.querySelectorAll('tbody tr').length ?? 0, nothingToFix: !!card?.textContent.includes('Nothing to fix') }
})
check('the wizard has rows to fix', rowInfo.rows > 0 && !rowInfo.nothingToFix, JSON.stringify(rowInfo))

const reviewed = await click(page, '.v-card-actions .v-btn', 'Review')
check('Review clicks', reviewed)
await sleep(1500)
const summary = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.v-overlay__content .v-card')].find(d => d.textContent.includes('Raw Resources Wizard'))
  return (card?.textContent || '').replace(/\s+/g, ' ').match(/This will:.{0,200}/)?.[0] ?? ''
})
console.log('      summary:', summary)
const applied = await click(page, '.v-card-actions .v-btn', 'Apply')
check('Apply clicks', applied)
check('the wizard closes once applied', await waitFor(async () => (await wizardOpenOn(page)) === false, 30000))
await sleep(3000)

// --- 5. The plan is actually fixed.
const planState = await page.evaluate(() => {
  const tabs = JSON.parse(localStorage.getItem('factoryTabs') || '[]')
  const tab = tabs[Number(localStorage.getItem('currentFactoryTabIndex') ?? 0)] ?? {}
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
check('the wizard built the mines it promised', planState.factories > (captured.factories?.length ?? 0),
  `${captured.factories?.length} -> ${planState.factories}`)
check('no factory is left with a problem', planState.problems.length === 0, planState.problems.join(', '))
check('nothing is still supplied out of thin air', planState.rawSupplied.length === 0, planState.rawSupplied.join(', '))

// --- 6. A reload does not raise it again.
await page.reload({ waitUntil: 'networkidle2' })
await sleep(4000)
check('the notice does not come back', (await promptStateOf(page)).open === false)

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
const missing = [...new Set(notFound)].filter(u => !u.includes(':3001'))
check('nothing 404s', missing.length === 0, missing.slice(0, 5).join(' | '))
await page.close()

// ============================================================================
// Each scenario below boots its own page, so one cannot leave state for the next.

// --- "I'll sort it myself": an answer, not a fix.
{
  const p = await bootLegacyPlan()
  await waitFor(async () => (await promptStateOf(p)).open)
  await click(p, '.v-btn', "I'll sort it myself")
  check('[decline] the notice closes', await waitFor(async () => (await promptStateOf(p)).open === false))
  await sleep(1500)
  const tabs = await tabsOf(p)
  check('[decline] the plan counts as answered', tabs[0]?.plannerVersion !== null, JSON.stringify(tabs))
  check('[decline] but is left exactly as it was, unfixed',
    tabs[0]?.factories === legacyTab.factories.length, `${tabs[0]?.factories} factories`)
  await p.reload({ waitUntil: 'networkidle2' })
  await sleep(4000)
  check('[decline] and is not nagged about again', (await promptStateOf(p)).open === false)
  await p.close()
}

// --- Closing it in the corner is the same answer as saying so.
{
  const p = await bootLegacyPlan()
  await waitFor(async () => (await promptStateOf(p)).open)
  await p.evaluate(() => {
    const card = [...document.querySelectorAll('.v-overlay__content .v-card')]
      .find(d => d.textContent.includes('Raw resource migration required'))
    card?.querySelector('.v-card-title .app-dialog-close')?.click()
  })
  check('[close] the X closes it', await waitFor(async () => (await promptStateOf(p)).open === false))
  await sleep(1500)
  check('[close] and answers for the plan', (await tabsOf(p))[0]?.plannerVersion !== null,
    JSON.stringify(await tabsOf(p)))
  await p.close()
}

// --- Cancelling the wizard rather than applying. Opening it was already the answer, so the plan
// is stamped either way — the notice must not come back to ask a question it has been given.
{
  const p = await bootLegacyPlan()
  await waitFor(async () => (await promptStateOf(p)).open)
  await click(p, '.v-btn', 'Run the wizard')
  check('[cancel] the wizard is open', await waitFor(() => wizardOpenOn(p)))
  await click(p, '.v-card-actions .v-btn', 'Cancel')
  check('[cancel] the wizard closes', await waitFor(async () => (await wizardOpenOn(p)) === false))
  await sleep(1500)
  check('[cancel] the notice does not reappear behind it', (await promptStateOf(p)).open === false)
  check('[cancel] the plan counts as answered, not as fixed', (await tabsOf(p))[0]?.plannerVersion !== null,
    JSON.stringify(await tabsOf(p)))
  await p.close()
}

// --- Landing somewhere other than the planner. The notice is mounted by the planner's tab bar,
// so it has nothing to say on /changelog — and, because the answer lives on the plan rather than
// in a one-time flag, nothing is spent by not saying it. The warning still finds them.
{
  const p = await bootLegacyPlan({ path: '/changelog' })
  await sleep(4000)
  check('[changelog] the notice holds off away from the planner', (await promptStateOf(p)).open === false)
  check('[changelog] and nothing is answered on the plan\'s behalf',
    (await tabsOf(p))[0]?.plannerVersion === null, JSON.stringify(await tabsOf(p)))
  await p.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/')
    if (link) link.click()
    else window.location.href = '/'
  })
  check('[changelog] the warning still finds them on the planner',
    await waitFor(async () => (await promptStateOf(p)).open))
  await p.close()
}

// --- A second pre-v0.6 plan in another tab, after the first has been answered. The answer belongs
// to the plan, so the one that has not been asked about still gets its warning.
{
  const answered = JSON.parse(JSON.stringify(legacyTab))
  answered.plannerVersion = '0.6'
  const second = JSON.parse(JSON.stringify(legacyTab))
  second.id = 'second-tab'
  second.name = 'Second legacy plan'
  const p = await bootLegacyPlan({ tabs: [answered, second], index: 1 })
  check('[second plan] the notice speaks for a plan that was never asked about',
    await waitFor(async () => (await promptStateOf(p)).open), JSON.stringify(await tabsOf(p)))
  await p.close()
}

// --- A first load with the release deck still unseen. The v0.7 deck auto-shows here and, unlike
// v0.6 in its own release, does not take the raw-resources warning over — the two are about
// different things now. So the notice must still reach the user, and must not be left stranded
// underneath the deck: it is answered by dismissing, and a dismiss the user cannot see is a plan
// silently marked as answered.
{
  const p = await bootLegacyPlan({ decksSeen: false })
  const deck = await waitFor(async () => (await deckOpenOn(p)) !== null)
  console.log(`      release deck on a first load: ${await deckOpenOn(p)}`)
  check('[first load] the release deck auto-shows', deck)
  check('[first load] the notice is raised alongside it, not swallowed by it',
    (await promptStateOf(p)).open, JSON.stringify(await promptStateOf(p)))
  check('[first load] the plan is left unanswered while the deck is up',
    (await tabsOf(p))[0]?.plannerVersion === null, JSON.stringify(await tabsOf(p)))

  // Closing the deck must not carry the notice away with it. Dismissing the notice stamps the
  // plan as answered, so a notice dismissed by a click aimed at the deck in front of it is a plan
  // marked answered by someone who never read the question.
  await p.evaluate(() => {
    const deck = [...document.querySelectorAll('.v-overlay__content .v-card')].find(d =>
      /What's new in Beta v0\.\d/.test(d.querySelector('.v-card-title')?.textContent ?? ''))
    deck?.querySelector('.v-card-title .deck-close')?.click()
  })
  check('[first load] the deck closes', await waitFor(async () => (await deckOpenOn(p)) === null))
  check('[first load] and the notice is still there behind it', (await promptStateOf(p)).open)
  check('[first load] with the plan still unanswered',
    (await tabsOf(p))[0]?.plannerVersion === null, JSON.stringify(await tabsOf(p)))
  await p.close()
}

await browser.close()
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
