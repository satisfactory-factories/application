// Finds app CSS that overrides a Vuetify spacing helper the markup asked for.
//
// Vuetify 3 emitted the helpers with `!important`, so `ml-0` always won. Vuetify 4
// puts them in the `vuetify-utilities` cascade layer instead, and unlayered rules
// beat every layer — so a plain `.inline-inputs { margin-left: 5px }` in
// global.scss now silently wins over an `ml-0` in the template. The compat block
// at the top of global.scss hands those back with `revert-layer`; this finds any
// that were missed, and any new ones introduced later.
//
// For each element carrying an `m*-`/`p*-` helper it compares the computed margin
// or padding against what that helper alone produces on a bare probe element.
//
// Run: start the dev server (`pnpm dev:web`, note the port), then from web/:
//   node testing/browser/utility-collisions.mjs            # against port 3000
//   PORT=3005 node testing/browser/utility-collisions.mjs  # other port
// Never run the dev server on port 3001 — vitest's global-setup gameData server
// binds it, and a vite instance squatting there breaks the unit suite.
// CHROMIUM=/path/to/chromium overrides the browser binary.
/* global getComputedStyle */
import puppeteer from 'puppeteer-core'

const PORT = process.env.PORT ?? '3000'
const CHROMIUM = process.env.CHROMIUM ?? '/usr/bin/chromium'
const BASE = `http://localhost:${PORT}`
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

let collisions = []
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000 })
  page.on('dialog', d => d.accept())

  await page.goto(BASE, { waitUntil: 'networkidle2' }).catch(() => {})
  await sleep(1000)
  await page.goto(`${BASE}/?setupDemo=true`, { waitUntil: 'networkidle2' })
  await sleep(1500)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.toLowerCase().includes('demo plan'))
    btn?.click()
  })
  await sleep(2000)
  await page.waitForSelector('.main-content .v-card[id]', { timeout: 15000 })

  collisions = await page.evaluate(() => {
    const SIDES = { t: ['Top'], r: ['Right'], b: ['Bottom'], l: ['Left'], x: ['Left', 'Right'], y: ['Top', 'Bottom'], a: ['Top', 'Right', 'Bottom', 'Left'] }
    // `auto` resolves to a used pixel value, so it can't be compared this way.
    const HELPER = /^([mp])([trblxya])-(n?\d+)$/
    const probes = new Map()

    // What the helper produces on its own, so the comparison doesn't hardcode
    // Vuetify's spacing scale.
    const expected = cls => {
      if (!probes.has(cls)) {
        const [, type, side] = cls.match(HELPER)
        const probe = document.createElement('div')
        probe.className = cls
        document.body.appendChild(probe)
        const styles = getComputedStyle(probe)
        const property = type === 'm' ? 'margin' : 'padding'
        probes.set(cls, Object.fromEntries(SIDES[side].map(s => [property + s, styles[property + s]])))
        probe.remove()
      }
      return probes.get(cls)
    }

    // These three behave identically under Vuetify 3.12.11 — they are the app's
    // own long-standing overrides, not fallout from the layer change, so they
    // are reported but don't fail the run.
    const PRE_EXISTING = [
      ['pt-n1', 'paddingTop', 'text-center'],
      ['pt-0', 'paddingTop', 'text-right'],
      ['my-2', 'marginBottom', 'selectors'],
    ]

    const found = new Map()
    for (const el of document.querySelectorAll('*')) {
      for (const cls of el.classList) {
        if (!HELPER.test(cls)) continue
        const styles = getComputedStyle(el)
        for (const [property, want] of Object.entries(expected(cls))) {
          if (styles[property] === want) continue
          const classes = [...el.classList].filter(c => !/^v-theme|^v-locale/.test(c))
          const known = PRE_EXISTING.some(([c, p, marker]) => c === cls && p === property && classes.includes(marker))
          const key = `${known ? 'known' : 'NEW'}\t${cls} loses on ${property}: want ${want}, got ${styles[property]}  [.${classes.join('.')}]`
          found.set(key, (found.get(key) ?? 0) + 1)
        }
      }
    }
    return [...found.entries()].map(([key, count]) => `${count}× ${key}`)
  })
} finally {
  await browser.close()
}

const isNew = line => line.includes('\tNEW\t') || line.includes('× NEW\t')
const fresh = collisions.filter(isNew)
console.log(collisions.length ? collisions.join('\n') : 'No utility collisions.')
if (fresh.length) {
  console.log(`\n${fresh.length} NEW COLLISIONS — app CSS is beating a helper the markup asked for.`)
  console.log('Hand the property back in global.scss: `.the-rule[class*="ml-"] { margin-left: revert-layer }`.')
} else if (collisions.length) {
  console.log(`\nOnly the ${collisions.length} pre-existing collisions. No new ones.`)
}
process.exit(fresh.length ? 1 : 0)
