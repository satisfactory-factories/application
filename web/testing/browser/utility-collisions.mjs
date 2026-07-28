// Finds app CSS that overrides a Vuetify helper class the markup asked for.
//
// Vuetify 3 emitted the helpers with `!important`, so `ml-0` always won. Vuetify 4
// puts them in the `vuetify-utilities` cascade layer instead, and unlayered rules
// beat every layer — so a plain `.inline-inputs { margin-left: 5px }` in
// global.scss now silently wins over an `ml-0` in the template. The compat block
// at the top of global.scss hands those back with `revert-layer`; this finds any
// that were missed, and any new ones introduced later.
//
// It works out what each helper does rather than hardcoding it: a probe element
// with the class is diffed against one without, and whatever properties differ
// are the ones the helper controls. Every element carrying that class is then
// checked on exactly those properties. Spacing was the obvious family, but the
// same inversion silently dropped the last product panel's border, so borders
// and radii are covered too.
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
    // Spacing (`auto` resolves to a used pixel value, so it can't be compared
    // this way), borders and radii — the families where app CSS realistically
    // sets the same property as a helper.
    const HELPER = /^([mp][trblxya]-n?\d+|border(-[a-z0-9]+)*|rounded(-[a-z0-9]+)*)$/
    // Only properties a helper actually declares. Diffing every computed
    // property instead drags in derived geometry — a bare probe div is
    // full-width, so width/transformOrigin/… differ for reasons of their own.
    // Logical aliases (marginBlockEnd &c.) mirror the physical ones and would
    // report every collision twice.
    const AUTHORED = /^(margin(Top|Right|Bottom|Left)$|padding(Top|Right|Bottom|Left)$|(row|column)Gap$|gap$|border(Top|Right|Bottom|Left)?(Width|Style)$|border(Top|Bottom)(Left|Right)Radius$)/
    const probes = new Map()

    // Work out what the helper actually does by diffing a probe carrying it
    // against one that doesn't, rather than hardcoding Vuetify's scales.
    const expected = cls => {
      if (!probes.has(cls)) {
        const bare = document.createElement('div')
        const probe = document.createElement('div')
        probe.className = cls
        document.body.append(bare, probe)
        const a = getComputedStyle(bare)
        const b = getComputedStyle(probe)
        const effect = {}
        for (const property of a) {
          const camel = property.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          if (!AUTHORED.test(camel)) continue
          if (a[camel] !== b[camel]) effect[camel] = b[camel]
        }
        // A helper whose value matches the default — `pt-0` on a bare div —
        // leaves no diff, and those are exactly the interesting ones: the
        // markup asked for zero because something else is adding padding. Take
        // the properties from the class name for that family.
        const spacing = cls.match(/^([mp])([trblxya])-n?\d+$/)
        if (spacing) {
          const property = spacing[1] === 'm' ? 'margin' : 'padding'
          for (const side of SIDES[spacing[2]]) effect[property + side] = b[property + side]
        }
        probes.set(cls, effect)
        bare.remove()
        probe.remove()
      }
      return probes.get(cls)
    }

    // These behave identically under Vuetify 3.12.11 — the app's own deliberate
    // overrides (the 5px accent border down a factory item, the dashed-chip
    // border, the flush-bottom selector bar), not fallout from the layer change.
    // Reported, but they don't fail the run. [helper, property, marker class]
    const PRE_EXISTING = [
      [/^pt-n1$/, /^paddingTop$/, 'text-center'],
      [/^pt-0$/, /^paddingTop$/, 'text-right'],
      [/^my-2$/, /^marginBottom$/, 'selectors'],
      [/^border-b-md$/, /^borderBottom(Width|Style)$/, 'selectors'],
      [/^border-md$/, /^borderLeftWidth$/, 'factory-item'],
      [/^border-dashed$/, /Width$/, 'border-gray'],
      [/^border$/, /Style$/, 'border-dashed'],
    ]

    const found = new Map()
    for (const el of document.querySelectorAll('*')) {
      for (const cls of el.classList) {
        if (!HELPER.test(cls)) continue
        const styles = getComputedStyle(el)
        for (const [property, want] of Object.entries(expected(cls))) {
          if (styles[property] === want) continue
          const classes = [...el.classList].filter(c => !/^v-theme|^v-locale/.test(c))
          const known = PRE_EXISTING.some(([c, p, marker]) => c.test(cls) && p.test(property) && classes.includes(marker))
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
