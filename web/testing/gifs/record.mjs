/* global getComputedStyle, HTMLElement */
// The globals above are used inside page.evaluate callbacks, which run in the browser.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import { execSync } from 'child_process'

const PORT = process.env.PORT ?? '3005'
const BASE = `http://localhost:${PORT}`
// Set CHROMIUM to override. The defaults cover the CI/container image and a normal desktop
// install; puppeteer-core ships no browser of its own.
const CHROMIUM = process.env.CHROMIUM ?? [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p))
if (!CHROMIUM) throw new Error('No Chromium found. Set CHROMIUM=/path/to/chrome')
const HERE = new URL('.', import.meta.url).pathname
const STATES = `${HERE}states`
// Frames and GIFs land outside the repo tree by default; .gif-out is gitignored.
const OUT = process.env.GIF_OUT ?? `${HERE}../../.gif-out`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// Output frames per captured "beat" for everything except cursor travel. See captureFrame.
const HOLD_REPEAT = 2

const IRON = {
  factory: '4069',
  product: 'IronRod',
  group1: '2374',
  seed: fs.readFileSync(`${STATES}/iron-rod.json`, 'utf8'),
}
const IRON_SYNC = {
  factory: '4069',
  product: 'IronRod',
  group1: '2374',
  seed: fs.readFileSync(`${STATES}/iron-rod-sync.json`, 'utf8'),
}
const ASSEMBLER = {
  factory: '8938',
  product: 'IronPlateReinforced',
  group1: '1204',
  seed: fs.readFileSync(`${STATES}/assembler.json`, 'utf8'),
}
const rowId = base => `${base.factory}-products-item-${base.product}`

const seedScript = seed => `
  localStorage.setItem('dismissed-introduction', 'true')
  localStorage.setItem('seenV6Splash', 'true')
  localStorage.setItem('seenV51Splash', 'true')
  localStorage.setItem('seenV5Splash', 'true')
  localStorage.setItem('tutorialBuildingGroups2', 'true')
  localStorage.setItem('currentFactoryTabIndex', '0')
  localStorage.setItem('factoryTabs', ${JSON.stringify(seed)})
`

// A visible fake cursor: a soft ring that follows real mousemove events, plus a "press"
// pulse on mousedown/mouseup. Two highlight boxes (independent) can be shown over any
// element to draw the eye to a stat that's about to change; a box can optionally expand to
// its nearest ancestor matching a selector, so a highlight on a value that's about to grow
// wider (a power draw, an output figure) covers the whole stat, not just the digits.
const overlayScript = `
  (function () {
    function install() {
      var cursor = document.createElement('div')
      cursor.id = '__gif_cursor'
      cursor.style.cssText = [
        'position:fixed', 'left:0', 'top:0', 'width:44px', 'height:44px',
        'margin-left:-22px', 'margin-top:-22px', 'border-radius:50%',
        'background:radial-gradient(circle, rgba(255,214,0,0.38) 0%, rgba(255,214,0,0.14) 60%, rgba(255,214,0,0) 100%)',
        'border:3px solid rgba(255,214,0,0.95)',
        'box-shadow:0 0 18px 5px rgba(255,214,0,0.55)',
        'pointer-events:none', 'z-index:2147483647', 'opacity:0',
        'transition:opacity .15s ease',
        'transform:scale(1)',
      ].join(';')
      document.body.appendChild(cursor)
      window.addEventListener('mousemove', function (e) {
        cursor.style.left = e.clientX + 'px'
        cursor.style.top = e.clientY + 'px'
        cursor.style.opacity = '1'
      }, true)
      // Press state is driven explicitly by the recorder, not by mousedown/mouseup listeners.
      // Some clicks are dispatched atomically (page.mouse.click fires down and up with nothing
      // in between), so an event-driven press would exist for zero captured frames and the
      // reader would never see it. Driving it by hand means the recorder can hold the pressed
      // look for as many frames as it takes to register.
      var IDLE = {
        border: 'rgba(255,214,0,0.95)',
        bg: 'radial-gradient(circle, rgba(255,214,0,0.38) 0%, rgba(255,214,0,0.14) 60%, rgba(255,214,0,0) 100%)',
        glow: '0 0 18px 5px rgba(255,214,0,0.55)',
      }
      var PRESSED = {
        border: 'rgba(0,230,118,0.98)',
        bg: 'radial-gradient(circle, rgba(0,230,118,0.55) 0%, rgba(0,230,118,0.22) 60%, rgba(0,230,118,0) 100%)',
        glow: '0 0 24px 8px rgba(0,230,118,0.7)',
      }
      function paint(state, scale) {
        // Applied with transitions off: every one of these states has to be fully rendered in
        // the very next frame, and a half-finished colour fade reads as a muddy in-between.
        cursor.style.transition = 'none'
        cursor.style.borderColor = state.border
        cursor.style.background = state.bg
        cursor.style.boxShadow = state.glow
        cursor.style.transform = 'scale(' + scale + ')'
        void cursor.offsetHeight
        cursor.style.transition = 'opacity .15s ease'
      }
      window.__gifCursorPress = function () { paint(PRESSED, 0.72) }
      window.__gifCursorRelease = function () { paint(IDLE, 1) }

      function makeBox(id) {
        var box = document.createElement('div')
        box.id = id
        box.style.cssText = [
          'position:fixed', 'left:0', 'top:0', 'width:0', 'height:0',
          'border:3px solid #ffd600', 'border-radius:8px',
          'box-shadow:0 0 16px 4px rgba(255,214,0,0.5)',
          'pointer-events:none', 'z-index:2147483646', 'opacity:0',
          'transition:opacity .2s ease',
        ].join(';')
        document.body.appendChild(box)
        return box
      }
      var box1 = makeBox('__gif_highlight')
      var box2 = makeBox('__gif_highlight2')

      // A box covers the union of one or more elements, so a value split across sibling spans
      // ("2.00 | 2.00 short" is three spans plus a bare text node) can be boxed as the one
      // reading it actually is, rather than boxing whichever span happens to hold the first
      // number.
      function place(box, spec) {
        var rects = []
        for (var i = 0; i < spec.ids.length; i++) {
          var el = document.getElementById(spec.ids[i])
          if (!el) continue
          if (spec.expand) el = el.closest(spec.expand) || el
          var r = el.getBoundingClientRect()
          if (!r.width && !r.height) continue
          rects.push(r)
        }
        if (!rects.length) { box.style.opacity = '0'; return }
        var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
        for (var j = 0; j < rects.length; j++) {
          left = Math.min(left, rects[j].x)
          top = Math.min(top, rects[j].y)
          right = Math.max(right, rects[j].x + rects[j].width)
          bottom = Math.max(bottom, rects[j].y + rects[j].height)
        }
        box.style.left = (left - 8) + 'px'
        box.style.top = (top - 8) + 'px'
        box.style.width = (right - left + 16) + 'px'
        box.style.height = (bottom - top + 16) + 'px'
        box.style.opacity = '1'
      }

      // Highlights are sticky: showing one records what it is tracking, and every frame
      // re-measures it (see placeActive, called from the stabiliser). A box measured only at
      // the moment it appears freezes at that size, so a value that then grows — a power draw
      // climbing, a figure gaining a digit, a "short" suffix appearing — outgrows its own box
      // and the highlight ends up covering part of what it is pointing at.
      var active1 = null
      var active2 = null
      function placeActive() {
        if (active1) place(box1, active1)
        if (active2) place(box2, active2)
      }
      window.__gifPlaceHighlights = placeActive

      window.__gifHighlightShow = function (target, expandSelector) {
        active1 = { ids: [].concat(target), expand: expandSelector }
        active2 = null
        placeActive()
      }
      window.__gifHighlightHide = function () {
        active1 = null
        box1.style.opacity = '0'
      }
      window.__gifHighlightShow2 = function (idA, idB, expandSelector) {
        active1 = { ids: [].concat(idA), expand: expandSelector }
        active2 = { ids: [].concat(idB), expand: expandSelector }
        placeActive()
      }
      window.__gifCursorHide = function () {
        // Bypass the opacity transition: setting it to 0 with the transition still active
        // just starts a 150ms fade, so a screenshot taken immediately after still shows the
        // cursor near-opaque. Disable the transition for one frame, force a reflow, then
        // restore it so later fades (the real glides) still animate normally.
        cursor.style.transition = 'none'
        cursor.style.opacity = '0'
        void cursor.offsetHeight
        cursor.style.transition = 'opacity .15s ease'
      }
      window.__gifHighlightHide2 = function () {
        active1 = null
        active2 = null
        box1.style.opacity = '0'
        box2.style.opacity = '0'
      }
    }
    if (document.body) install()
    else document.addEventListener('DOMContentLoaded', install)
  })()
`

// Layout stabilisation, injected before the app boots. Two independent jobs, both aimed at
// the same complaint: content sliding around under a stationary crop.
//
//  1. RESERVE. The "To cover the shortfall, add the equivalent of:" row is a v-if that blinks
//     in and out as the numbers cross in and out of balance — which is constantly, since the
//     scenarios are all about editing numbers. Each toggle shoved every building group row
//     down and back by ~33px. Rather than hide it (it's real UI the reader should see), give
//     it a permanently reserved band: pad the status header by the row's height, and cancel
//     the row's own contribution to flow with a matching negative top margin so it paints
//     into that band. Present or absent, the rows below never move.
//
//  2. ANCHOR. The crop is a fixed rectangle in viewport coordinates (the app scrolls an inner
//     div, so the visual viewport never moves and a document-relative clip is effectively a
//     viewport-relative one). Anything that shifts the product row within the viewport —
//     an inner scroll container being clamped as content grows or shrinks, a focus-driven
//     scrollIntoView, a height change above the row — slides the whole scene under that fixed
//     crop. Before every frame, put the row back exactly where it started.
const stabilizeScript = `
  (function () {
    // Pinned by the caller from a real measurement, never learned at runtime. An earlier cut
    // grew the reserve to whatever the tallest hint it happened to see needed, and a mid-edit
    // intermediate value (typing "20" passes through "2", a big enough shortfall to wrap the
    // chips onto several lines) latched it at ~100px for the rest of the recording — a
    // permanent gap that pushed the last building group out of the crop entirely.
    var reserve = 0
    var maxSeen = 0

    function adjust() {
      var hints = document.querySelectorAll('[id$="-shortfall-hints"]')
      for (var j = 0; j < hints.length; j++) {
        var hint = hints[j]
        // One line, always: keeping the row from wrapping is what makes a single fixed reserve
        // correct for every value the scenario passes through.
        if (hint.style.flexWrap !== 'nowrap') {
          hint.style.flexWrap = 'nowrap'
          hint.style.whiteSpace = 'nowrap'
        }
        var outer = Math.ceil(hint.offsetHeight + (parseFloat(getComputedStyle(hint).marginBottom) || 0))
        if (outer > maxSeen) maxSeen = outer
        var pull = '-' + outer + 'px'
        if (hint.style.marginTop !== pull) hint.style.marginTop = pull
      }
      var pad = reserve + 'px'
      var headers = document.querySelectorAll('[id$="-buildings-status"]')
      for (var i = 0; i < headers.length; i++) {
        var header = headers[i].parentElement
        if (header && header.style.paddingBottom !== pad) header.style.paddingBottom = pad
      }
      // Highlight boxes track their targets on the same cadence as everything else, so one
      // held across an edit keeps fitting the value as it changes width.
      if (window.__gifPlaceHighlights) window.__gifPlaceHighlights()
    }

    window.__gifSetReserve = function (px) { reserve = Math.ceil(px); adjust() }
    window.__gifMaxHint = function () { return maxSeen }
    window.__gifStabilize = adjust

    // Puts the anchor row back at the viewport y it had when the scenario started, by scrolling
    // whichever ancestor actually moves. Returns the achieved y so the recorder can assert that
    // it really did land (a container clamped at either end can't compensate, and silently
    // drifting is exactly the failure mode worth catching).
    window.__gifAnchor = function (rowId, targetY) {
      var el = document.getElementById(rowId)
      if (!el) return null
      var scrollers = []
      var node = el.parentElement
      while (node) {
        var cs = getComputedStyle(node)
        if (/(auto|scroll|overlay)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1) scrollers.push(node)
        node = node.parentElement
      }
      var doc = document.scrollingElement || document.documentElement
      if (scrollers.indexOf(doc) === -1) scrollers.push(doc)
      for (var pass = 0; pass < 4; pass++) {
        var delta = el.getBoundingClientRect().y - targetY
        if (Math.abs(delta) < 0.25) break
        var moved = false
        for (var i = 0; i < scrollers.length; i++) {
          var sc = scrollers[i]
          var before = sc.scrollTop
          sc.scrollTop = before + delta
          if (Math.abs(sc.scrollTop - before) > 0.25) { moved = true; break }
        }
        if (!moved) break
      }
      return el.getBoundingClientRect().y
    }

    function loop() { adjust(); requestAnimationFrame(loop) }
    if (document.body) requestAnimationFrame(loop)
    else document.addEventListener('DOMContentLoaded', function () { requestAnimationFrame(loop) })
  })()
`

// ---- element lookups ----

// Where the cursor should sit to read as "pointing at the thing that is about to change".
// For a button that is the box centre, but for a text input it is the centre of the rendered
// digits, which is not the same place: Vuetify's Qty/min field is left-aligned inside a box
// with 16px of lead padding, so aiming at the box centre parked the ring in the empty space to
// the right of the number it was editing. Measures the glyph run with the input's own computed
// font and honours its text-align, so centred fields (which most of them are) come out exactly
// where they did before.
const centerOf = async (page, id) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const box = await page.evaluate(id => {
      const el = document.getElementById(id)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const mid = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      if (el.tagName !== 'INPUT') return mid
      const text = el.value == null ? '' : String(el.value)
      if (!text) return mid
      const cs = getComputedStyle(el)
      const c2d = document.createElement('canvas').getContext('2d')
      c2d.font = cs.font || `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const textWidth = c2d.measureText(text).width
      if (!textWidth) return mid
      const bl = parseFloat(cs.borderLeftWidth) || 0
      const br = parseFloat(cs.borderRightWidth) || 0
      const pl = parseFloat(cs.paddingInlineStart || cs.paddingLeft) || 0
      const pr = parseFloat(cs.paddingInlineEnd || cs.paddingRight) || 0
      const inner = r.width - bl - br - pl - pr
      if (inner <= 0) return mid
      const left = r.x + bl + pl
      const align = cs.textAlign
      let x
      if (align === 'center') x = left + inner / 2
      else if (align === 'right' || align === 'end') x = left + inner - textWidth / 2
      else x = left + Math.min(textWidth, inner) / 2
      return { x, y: mid.y }
    }, id)
    if (box) return box
    await sleep(200)
  }
  throw new Error(`centerOf: no element #${id} after retries`)
}

const centerOfButtonText = async (page, source) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const box = await page.evaluate(pattern => {
      const rx = new RegExp(pattern, 'i')
      const btn = [...document.querySelectorAll('button')].find(b => rx.test(b.innerText))
      if (!btn) return null
      const r = btn.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, source)
    if (box) return box
    await sleep(200)
  }
  throw new Error(`centerOfButtonText: no button matching /${source}/i after retries`)
}

const centerOfIncrement = async (page, numberInputId) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const box = await page.evaluate(id => {
      const input = document.getElementById(id)
      if (!input) return null
      const wrapper = input.closest('.v-number-input') || input.closest('.v-input')
      if (!wrapper) return null
      // The somersloop field overrides Vuetify's default spin buttons with a custom
      // #increment slot (to grey the button out at the slot cap), which drops the default
      // data-testid="increment" attribute. Fall back to the topmost button in the wrapper.
      const tagged = wrapper.querySelector('[data-testid="increment"]')
      const btn = tagged || [...wrapper.querySelectorAll('button')].sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y)[0]
      if (!btn) return null
      const r = btn.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, numberInputId)
    if (box) return box
    await sleep(200)
  }
  throw new Error(`centerOfIncrement: no increment button for #${numberInputId} after retries`)
}

// ---- frame capture: a fixed clip rect established once per scenario (see recordScenario),
// never re-measured per frame. Re-measuring against the live DOM every frame was an earlier
// source of bounce: a transient mid-transition layout would be captured as a real position and
// snap back on the next frame.
//
// A fixed clip alone isn't enough though, because it only fixes the *window*, not the scene
// behind it. Every frame therefore also re-runs the layout reserve and re-anchors the product
// row to the exact viewport y it started at (see stabilizeScript), so the scene behind the
// window is put back where it belongs before the shutter opens. Drift is recorded per frame so
// a scenario that fails to anchor reports itself instead of quietly shipping a jiggly GIF.
// `repeat` is how many output frames this capture occupies. The output runs at HOLD_REPEAT
// times the old frame rate, and everything that isn't cursor travel repeats itself that many
// times, so pauses, typing and highlights keep exactly the on-screen duration they had while
// cursor travel gets to use every frame. Repeats are file copies of one screenshot rather than
// re-screenshots: identical frames cost almost nothing to encode and nothing to capture.
const frameName = (ctx, i) => `${ctx.dir}/frame_${String(i).padStart(4, '0')}.png`

const captureFrame = async (page, ctx, repeat = HOLD_REPEAT) => {
  try {
    const landed = await page.evaluate(([id, target]) => {
      window.__gifStabilize()
      return window.__gifAnchor(id, target)
    }, [ctx.rowId, ctx.anchorY])
    if (typeof landed === 'number') ctx.drift.push(Math.abs(landed - ctx.anchorY))
    const first = frameName(ctx, ctx.n)
    await page.screenshot({ path: first, clip: { x: ctx.x, y: ctx.y, width: ctx.width, height: ctx.height } })
    ctx.n++
    for (let i = 1; i < repeat; i++) {
      fs.copyFileSync(first, frameName(ctx, ctx.n))
      ctx.n++
    }
  } catch { /* transient layout, skip this frame */ }
}

const holdFrames = async (page, ctx, count, gapMs) => {
  for (let i = 0; i < count; i++) {
    await sleep(gapMs)
    await captureFrame(page, ctx)
  }
}

// `target` is an element id or a list of them; a list boxes their union, for a value made of
// several spans. The box then re-measures itself on every frame for as long as it is shown
// (see the sticky highlight note in overlayScript), so it keeps fitting as the value changes.
const highlight = async (page, ctx, target, count = 5, gapMs = 340, expandSelector = null) => {
  await page.evaluate(([t, sel]) => window.__gifHighlightShow(t, sel), [target, expandSelector])
  if (process.env.GIF_DEBUG_HIGHLIGHT) {
    const dbg = await page.evaluate(t => {
      const R = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), right: +(r.x + r.width).toFixed(1), y: +r.y.toFixed(1) } }
      const box = document.getElementById('__gif_highlight')
      const targets = {}
      for (const id of [].concat(t)) { const el = document.getElementById(id); targets[id] = el ? R(el) : null }
      return { box: R(box), boxStyle: { left: box.style.left, width: box.style.width }, targets }
    }, target)
    console.log(`[debug highlight] cropX=${ctx.x} ${JSON.stringify(dbg)}`)
  }
  await captureFrame(page, ctx)
  for (let i = 0; i < count; i++) {
    await sleep(gapMs)
    await captureFrame(page, ctx)
  }
}

const unhighlight = async (page, ctx) => {
  await page.evaluate(() => window.__gifHighlightHide())
  await captureFrame(page, ctx)
}

// Two independent boxes at once — for showing two building groups landed on the same value.
const highlightTwo = async (page, ctx, idA, idB, count = 5, gapMs = 340, expandSelector = null) => {
  await page.evaluate(([a, b, sel]) => window.__gifHighlightShow2(a, b, sel), [idA, idB, expandSelector])
  await captureFrame(page, ctx)
  for (let i = 0; i < count; i++) {
    await sleep(gapMs)
    await captureFrame(page, ctx)
  }
}

const unhighlightTwo = async (page, ctx) => {
  await page.evaluate(() => window.__gifHighlightHide2())
  await captureFrame(page, ctx)
}

// Moves the visible cursor to a target as a single flowing gesture: step count scales with
// distance, an ease-in-out curve makes it accelerate away and settle in rather than crawl at a
// constant rate, and a slight perpendicular bow keeps it off a dead-straight line so it reads
// as a hand rather than a linear tween. Every step is its own output frame (repeat 1), which
// is what buys the smoothness — at the old rate this many steps would have crawled.
const glide = async (page, ctx, target) => {
  const from = ctx.cursor ?? target
  const dx = target.x - from.x
  const dy = target.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist < 2) { ctx.cursor = target; return }
  // Tuned so a typical hop covers roughly the ground the old 7-step glide did in about the
  // same wall time, but with two to three times the frames: the point of the extra rate is
  // smoothness, not a slower demo.
  const steps = Math.max(10, Math.min(26, Math.round(dist / 24)))
  const bow = Math.min(46, dist * 0.11)
  const nx = -dy / dist
  const ny = dx / dist
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    // sin() is zero at both ends, so the bow swells mid-travel and the cursor still lands
    // exactly on the target rather than approaching it off-axis.
    const arc = Math.sin(Math.PI * e) * bow
    await page.mouse.move(from.x + dx * e + nx * arc, from.y + dy * e + ny * arc)
    await captureFrame(page, ctx, 1)
    await sleep(16)
  }
  ctx.cursor = target
}

// Holds the pressed (green) cursor for a beat either side of the actual event, so the click
// registers visually no matter how the event itself is dispatched.
//
// `blur` defaults on because a button left focused can trigger the browser's own
// scroll-into-view, which showed up as a jiggle in an earlier cut. It must be turned OFF when
// the click's whole purpose was to focus a field about to be typed into: blurring there throws
// the focus away and the keystrokes land on the body instead, which silently produced a full
// set of recordings in which not one value ever changed.
const showPress = async (page, ctx, fire, { blur = true } = {}) => {
  await page.evaluate(() => window.__gifCursorPress())
  await captureFrame(page, ctx)
  await fire()
  await captureFrame(page, ctx)
  await page.evaluate(shouldBlur => {
    if (shouldBlur && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.__gifCursorRelease()
  }, blur)
  await captureFrame(page, ctx)
}

// Glides in, pauses so it reads as "about to click", presses, releases, then holds on the
// result so the reader has time to see what changed. Blurs afterwards: a focused button can
// trigger the browser's own scroll-into-view, which showed up as a jiggle in an earlier cut.
const glideAndClick = async (page, ctx, target) => {
  await glide(page, ctx, target)
  await holdFrames(page, ctx, 2, 240)
  await showPress(page, ctx, async () => {
    await page.mouse.down()
    await sleep(170)
    await page.mouse.up()
  })
  await holdFrames(page, ctx, 5, 340)
}

// Re-anchor before measuring a click target, so the coordinates we hand the mouse are taken
// from the same settled layout the next frame will be captured in. Without this a target
// measured while the scene was drifted would be clicked after the drift was corrected away.
const anchorNow = async (page, ctx) => {
  await page.evaluate(([id, target]) => {
    window.__gifStabilize()
    window.__gifAnchor(id, target)
  }, [ctx.rowId, ctx.anchorY])
}

const clickId = async (page, ctx, id) => {
  await anchorNow(page, ctx)
  const point = await centerOf(page, id)
  await glideAndClick(page, ctx, point)
}

const clickText = async (page, ctx, re) => {
  await anchorNow(page, ctx)
  const point = await centerOfButtonText(page, re.source)
  await glideAndClick(page, ctx, point)
}

const clickIncrement = async (page, ctx, numberInputId) => {
  await anchorNow(page, ctx)
  const point = await centerOfIncrement(page, numberInputId)
  await glide(page, ctx, point)
  await holdFrames(page, ctx, 2, 240)
  // A quick atomic click, not a held mouse.down()/up() pair: this specific spin button
  // registered extra increments per press when held (observed 1 press -> +3-4) — a held
  // press apparently isn't safe here, so click() (single native click event) instead. The
  // pressed cursor is shown around it by showPress, since an atomic click leaves no window
  // in which to capture one.
  await showPress(page, ctx, () => page.mouse.click(point.x, point.y))
  await holdFrames(page, ctx, 5, 340)
}

// Previously this teleported the cursor to the field (it moved with steps, but captured no
// frames along the way, so in the GIF the ring simply vanished and reappeared). It now travels
// there like any other click.
const setNumberInput = async (page, ctx, id, value) => {
  await anchorNow(page, ctx)
  const point = await centerOf(page, id)
  await glide(page, ctx, point)
  await holdFrames(page, ctx, 2, 240)
  await showPress(page, ctx, async () => {
    await page.mouse.down()
    await sleep(150)
    await page.mouse.up()
  }, { blur: false })
  await sleep(320)
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control')
  await sleep(220)
  await captureFrame(page, ctx)
  const str = String(value)
  for (const ch of str) {
    await page.keyboard.type(ch)
    await sleep(170)
    await captureFrame(page, ctx)
  }
  await holdFrames(page, ctx, 7, 340)
  // Assert the edit actually landed. Without this a recording where every keystroke missed its
  // field still produces six perfectly stable, perfectly wrong GIFs.
  const landed = await page.evaluate(i => document.getElementById(i)?.value, id)
  if (String(landed) !== str) throw new Error(`setNumberInput: #${id} is "${landed}", expected "${str}"`)
}

const getGroupIds = async (page, factory) => page.evaluate((fid, addBtnId) => {
  return [...document.querySelectorAll(`[id^="${fid}-"][id$="-building-group"]`)]
    .filter(el => el.id !== addBtnId)
    .map(el => el.id.replace(`${fid}-`, '').replace('-building-group', ''))
}, factory, `${factory}-add-building-group`)

// Clicks "Add Building Group" (a plain fast click, no capture/animation — used to reach a
// target group count before recording, not as a recorded action) until the group count hits
// `count`.
const addGroupsUntil = async (page, factory, count) => {
  let ids = await getGroupIds(page, factory)
  while (ids.length < count) {
    const point = await centerOf(page, `${factory}-add-building-group`)
    await page.mouse.click(point.x, point.y)
    await sleep(600)
    ids = await getGroupIds(page, factory)
  }
  return ids
}

const setupPage = async (browser, base) => {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 })
  page.on('dialog', d => d.accept())
  await page.evaluateOnNewDocument(seedScript(base.seed))
  await page.evaluateOnNewDocument(overlayScript)
  await page.evaluateOnNewDocument(stabilizeScript)
  await page.evaluateOnNewDocument(() => {
    const style = document.createElement('style')
    // scrollbar-gutter reserves the scrollbar's width whether or not it's actually showing,
    // so a scrollbar popping in and out mid-scenario can't shift the layout sideways.
    //
    // `stable`, NOT `stable both-edges`: both-edges also reserves a gutter on the *left*,
    // which moves the origin of the initial containing block. Every position:fixed overlay
    // here (the cursor ring, the highlight boxes) is placed from getBoundingClientRect
    // coordinates, which stay true to the viewport, so under both-edges each one rendered
    // ~15px right of where it was told to go. That is why the ring sat off its target and the
    // highlight box clipped the leading digit of the value it was meant to frame.
    style.textContent = 'html, body { scroll-behavior: auto !important; scrollbar-gutter: stable !important; }'
    const attach = () => document.head.appendChild(style)
    if (document.head) attach()
    else document.addEventListener('DOMContentLoaded', attach)
  })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(1000)
  for (let i = 0; i < 5; i++) {
    const acted = await page.evaluate(() => {
      const overlay = document.querySelector('.v-overlay--active')
      if (!overlay) return false
      const btn = overlay.querySelector('button')
      if (btn) { btn.click(); return true }
      return false
    })
    if (!acted) break
    await sleep(400)
  }
  // The seeded plan can leave the app on whatever route localStorage last recorded (e.g. the
  // Statistics tab), not the Planner.
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('a,button')].find(e => /planner/i.test(e.innerText))
    if (link) link.click()
  })
  await sleep(600)
  await page.waitForSelector(`[id="${rowId(base)}"]`, { timeout: 15000 })
  await page.evaluate(id => {
    document.getElementById(id).scrollIntoView({ block: 'start', behavior: 'instant' })
    window.scrollBy(0, -120)
  }, rowId(base))
  await sleep(300)
  // Retry rather than a single immediate check: right after scrollIntoView, Vue may not
  // have finished rendering the building-group rows yet, which read as "tray closed" and
  // triggered a spurious open click — visibly toggling an already-open tray and showing up
  // as an extra, unexplained first action in the recording.
  let trayOpen = false
  for (let i = 0; i < 8; i++) {
    trayOpen = await page.evaluate(fid => !!document.querySelector(`[id^="${fid}-"][id$="-building-group"]`), base.factory)
    if (trayOpen) break
    await sleep(200)
  }
  if (!trayOpen) {
    const point = await centerOfButtonText(page, 'open building groups')
    await page.mouse.move(point.x, point.y, { steps: 10 })
    await sleep(200)
    await page.mouse.down()
    await sleep(100)
    await page.mouse.up()
    await sleep(500)
  }
  return page
}

// Types a value into a number input with no capture and no cursor animation — setup only.
const fastType = async (page, id, value) => {
  const point = await centerOf(page, id)
  await page.mouse.click(point.x, point.y)
  await sleep(150)
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control')
  await page.keyboard.type(String(value))
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await sleep(400)
}

const syncIsOn = async (page, base) => page.evaluate(id => {
  const btn = document.getElementById(id)
  return !!btn && /enabled/i.test(btn.innerText)
}, `${base.factory}-${base.product}-toggle-sync`)

// Measures the fixed capture box a scenario will use for every frame: opens a throwaway page
// on the same seed, grows the building group tray to the scenario's maximum group count (the
// tallest it will ever get), and measures down to the bottom of the "Add Custom Building" row
// — the true maximum content height — rather than guessing a constant. The page is then
// discarded; recordScenario opens a fresh one for the actual capture, so growing groups here
// never touches the state the real recording starts from.
//
// It also learns the shortfall hint row's height here, by deliberately driving the item into
// under-production so the row renders. Learning it up front matters: the reserve can only be
// applied from a height it knows, and waiting for the row's first appearance during the real
// recording would mean shipping exactly one uncompensated jump.
const measureFixedBox = async (browser, base, maxGroups) => {
  const page = await setupPage(browser, base)
  await addGroupsUntil(page, base.factory, maxGroups)
  await sleep(500)

  const originalAmount = await page.evaluate(id => document.getElementById(id)?.value ?? '', `${base.factory}-${base.product}-amount`)
  if (await syncIsOn(page, base)) {
    const p = await centerOf(page, `${base.factory}-${base.product}-toggle-sync`)
    await page.mouse.click(p.x, p.y)
    await sleep(400)
  }
  await fastType(page, `${base.factory}-${base.product}-amount`, 999)
  await sleep(700)
  const hintHeight = await page.evaluate(id => {
    const el = document.getElementById(id)
    if (!el) return 0
    return Math.ceil(el.offsetHeight + (parseFloat(getComputedStyle(el).marginBottom) || 0))
  }, `${base.factory}-${base.product}-shortfall-hints`)
  await page.evaluate(h => window.__gifSetReserve(h), hintHeight)
  // Put the quantity back before measuring: at 999 the figures grow wide enough to wrap chips
  // onto extra lines, which would inflate the crop with height no scenario ever uses.
  await fastType(page, `${base.factory}-${base.product}-amount`, originalAmount || 15)
  await sleep(700)

  const box = await page.evaluate(rid => {
    const row = document.getElementById(rid)
    const r = row.getBoundingClientRect()
    const addCustomBtn = [...document.querySelectorAll('button')].find(b => /add custom building/i.test(b.innerText))
    const bottom = addCustomBtn ? addCustomBtn.getBoundingClientRect().bottom : r.bottom
    return { x: r.x, width: r.width, top: r.y, bottom }
  }, rowId(base))
  await page.close()
  return {
    x: Math.max(0, Math.floor(box.x) - 6),
    // The trailing ~20% of the row is dead air next to the recipe's short numbers, crop it
    // out so the meaningful content (and the click targets in it) render larger.
    width: Math.ceil(box.width * 0.8),
    height: Math.ceil(box.bottom - box.top) + 16,
    hintHeight,
  }
}

const recordScenario = async (browser, name, base, maxGroups, actionFn) => {
  const { x, width, height, hintHeight } = await measureFixedBox(browser, base, maxGroups)
  const page = await setupPage(browser, base)
  // Reserve the shortfall band before anything is measured or captured, so the anchor y below
  // is taken from a layout that already includes it and never has to absorb it later.
  await page.evaluate(h => window.__gifSetReserve(h), hintHeight)
  await sleep(400)
  const anchorY = await page.evaluate(id => document.getElementById(id).getBoundingClientRect().y, rowId(base))
  const y = Math.max(0, Math.floor(anchorY) - 6)

  const frameDir = `${OUT}/frames-${name}`
  fs.rmSync(frameDir, { recursive: true, force: true })
  fs.mkdirSync(frameDir, { recursive: true })

  // setupPage's own clicks (dismissing the loader, opening the tray) leave the real cursor
  // resting wherever they landed — visible in frame 0 as a stray hover with no corresponding
  // action in the recording. Hide it and give the first glide a neutral start point (the
  // crop's top-left corner) so it fades in cleanly on the scenario's actual first move.
  const restCursor = { x: x + 24, y: y + 24 }
  await page.mouse.move(restCursor.x, restCursor.y)
  await page.evaluate(() => window.__gifCursorHide())
  const ctx = { dir: frameDir, n: 0, x, y, width, height, cursor: restCursor, rowId: rowId(base), anchorY, drift: [] }

  await captureFrame(page, ctx)
  await holdFrames(page, ctx, 4, 320)
  await actionFn(page, ctx, base)
  await holdFrames(page, ctx, 7, 380)

  const worstDrift = ctx.drift.length ? Math.max(...ctx.drift) : 0
  // maxHint over reserve would mean a hint row taller than its band, i.e. it overlapped the
  // rows below for those frames — worth seeing rather than discovering it in the GIF.
  const maxHint = await page.evaluate(() => window.__gifMaxHint())
  console.log(`[${name}] captured ${ctx.n} frames, x=${ctx.x} y=${ctx.y} width=${ctx.width} height=${ctx.height} reserve=${hintHeight}px maxHint=${maxHint}px worstAnchorDrift=${worstDrift.toFixed(2)}px`)
  await page.close()

  const paletteFile = `${frameDir}/palette.png`
  const gifOut = `${OUT}/${name}.gif`
  const mp4Out = `${OUT}/${name}.mp4`
  const webmOut = `${OUT}/${name}.webm`
  const OUT_WIDTH = 1040
  // The reader-facing pace is still one captured beat per ~143ms; FPS is doubled and every
  // non-movement capture is written twice (HOLD_REPEAT) to hold that pace exactly. What the
  // extra rate buys is cursor travel, which emits one frame per step and so plays at 14fps
  // instead of 7 — the difference between a flowing movement and a slide show.
  const FPS = 7 * HOLD_REPEAT
  // dither=none over bayer: on this flat-color UI bayer dithering roughly tripled file size
  // for no visible quality gain (see the split-into-groups GIF's earlier 3.25MB cut).
  execSync(`ffmpeg -y -framerate ${FPS} -i "${frameDir}/frame_%04d.png" -vf "scale=${OUT_WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=220" "${paletteFile}"`, { stdio: 'inherit' })
  execSync(`ffmpeg -y -framerate ${FPS} -i "${frameDir}/frame_%04d.png" -i "${paletteFile}" -filter_complex "scale=${OUT_WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none" -loop 0 "${gifOut}"`, { stdio: 'inherit' })
  const sizeKb = Math.round(fs.statSync(gifOut).size / 1024)
  console.log(`[${name}] gif written: ${gifOut} (${sizeKb} KB)`)

  // Video is what the tutorial embeds: a GIF in an <img> cannot be paused, seeked or asked for
  // its progress, so the player's controls need a real video element.
  //
  // Colour is the fiddly part, and both halves of it matter for a screen recording:
  //
  //  - TAGGING. A GIF stores RGB directly; video stores YUV, and the round trip is only correct
  //    if encoder and decoder agree on the matrix and range. Untagged, ffmpeg converts with
  //    bt601 below 720p while browsers assume bt709, and the greys come back visibly pale. Both
  //    outputs are therefore converted AND tagged bt709/limited, explicitly, end to end.
  //
  //  - CHROMA. h264's 4:2:0 subsamples colour 2x2, which softens exactly what this content is
  //    made of: one-pixel coloured borders and small coloured text. Measured against the source
  //    frames, 4:2:0 leaves ~4% of channels off by more than 8 and peaks at a delta of 116, and
  //    throwing bitrate at it barely helps (crf 10 is still 3.8%). VP9 at 4:4:4 drops that to
  //    0.00% and a peak delta of 14. Browsers do not decode h264's own 4:4:4 profile, so VP9 is
  //    the quality path and h264 the compatibility fallback; the player offers both.
  const vp9Crf = 24
  const h264Crf = 20
  const colourIn = `scale=${OUT_WIDTH}:-2:flags=lanczos:in_range=full:out_range=tv:out_color_matrix=bt709`
  const colourTags = '-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv'

  execSync(`ffmpeg -y -framerate ${FPS} -i "${frameDir}/frame_%04d.png" -vf "${colourIn},format=yuv444p" -c:v libvpx-vp9 -crf ${vp9Crf} -b:v 0 -profile:v 1 -row-mt 1 -deadline good -cpu-used 2 ${colourTags} -an "${webmOut}"`, { stdio: 'inherit' })
  console.log(`[${name}] webm written: ${webmOut} (${Math.round(fs.statSync(webmOut).size / 1024)} KB)`)

  // -2 keeps the height even, which 4:2:0 requires.
  execSync(`ffmpeg -y -framerate ${FPS} -i "${frameDir}/frame_%04d.png" -vf "${colourIn},format=yuv420p" -c:v libx264 -pix_fmt yuv420p -crf ${h264Crf} -preset veryslow -tune animation ${colourTags} -movflags +faststart -an "${mp4Out}"`, { stdio: 'inherit' })
  console.log(`[${name}] mp4 written: ${mp4Out} (${Math.round(fs.statSync(mp4Out).size / 1024)} KB)`)
}

// ---- scenarios ----

const scenarioGroups = async (page, ctx, base) => {
  await clickId(page, ctx, `${base.factory}-add-building-group`)
  await holdFrames(page, ctx, 4, 360)
  const ids = await getGroupIds(page, base.factory)
  const group2 = ids[1]
  await setNumberInput(page, ctx, `${base.factory}-${base.group1}-building-count`, 2)
  await holdFrames(page, ctx, 4, 360)
  await setNumberInput(page, ctx, `${base.factory}-${group2}-building-count`, 2)
  await holdFrames(page, ctx, 4, 360)
  await clickId(page, ctx, `${base.factory}-add-building-group`)
  await holdFrames(page, ctx, 4, 360)
  await setNumberInput(page, ctx, `${base.factory}-${group2}-building-count`, 1)
  // Deliberately stops here: the 3rd group sits at 1 building (the minimum), ready to
  // configure, rather than also re-touching it (confusing, made it look like the tool
  // was second-guessing itself).
}

const scenarioSync = async (page, ctx, base) => {
  // Starts at 1 building @ 100% (15/min). Sync is on: typing the item's own quantity
  // rebalances the group's building count to match, so 60 lands on 4 buildings @ 100%.
  await setNumberInput(page, ctx, `${base.factory}-${base.product}-amount`, 60)
  await highlight(page, ctx, `${base.factory}-${base.group1}-building-count`, 6, 340)
  await unhighlight(page, ctx)
  await holdFrames(page, ctx, 3, 360)

  // Turn sync off, then fiddle with the group. With sync off the item's own quantity is
  // left alone no matter what the group does.
  await clickId(page, ctx, `${base.factory}-${base.product}-toggle-sync`)
  await holdFrames(page, ctx, 3, 360)
  await setNumberInput(page, ctx, `${base.factory}-${base.group1}-building-count`, 2)
  await highlight(page, ctx, `${base.factory}-${base.product}-amount`, 6, 340)
  await unhighlight(page, ctx)

  // Turn sync back on: now editing the group pushes straight back up to the item again.
  await clickId(page, ctx, `${base.factory}-${base.product}-toggle-sync`)
  await holdFrames(page, ctx, 3, 360)
  await setNumberInput(page, ctx, `${base.factory}-${base.group1}-building-count`, 3)
  await highlight(page, ctx, `${base.factory}-${base.product}-amount`, 6, 340)
  await unhighlight(page, ctx)

  // Add a second group. Sync auto-disables the moment a second group exists, so re-enable
  // it, then grow the new group by 2 buildings and watch the item's total climb again.
  await clickId(page, ctx, `${base.factory}-add-building-group`)
  await holdFrames(page, ctx, 4, 360)
  const ids = await getGroupIds(page, base.factory)
  const group2 = ids[1]
  await clickId(page, ctx, `${base.factory}-${base.product}-toggle-sync`)
  await holdFrames(page, ctx, 3, 360)
  await clickIncrement(page, ctx, `${base.factory}-${group2}-building-count`)
  await holdFrames(page, ctx, 2, 300)
  await clickIncrement(page, ctx, `${base.factory}-${group2}-building-count`)
  await highlight(page, ctx, `${base.factory}-${base.product}-amount`, 6, 340)
  await unhighlight(page, ctx)
}

const scenarioOverclock = async (page, ctx, base) => {
  await setNumberInput(page, ctx, `${base.factory}-${base.group1}-clock`, 200)
  await setNumberInput(page, ctx, `${base.factory}-${base.group1}-clock`, 50)
  await clickText(page, ctx, /oc @ 100%/i)
}

const scenarioSomersloops = async (page, ctx, base) => {
  const sloopId = `${base.factory}-${base.group1}-somersloops`
  const powerId = `${base.factory}-${base.group1}-group-power`
  // Expand to the underchip (icon + value together, not just the number span): the value's
  // width grows as power usage climbs, and only the parent naturally re-fits it.
  await clickIncrement(page, ctx, sloopId)
  await highlight(page, ctx, powerId, 5, 300, '.underchip')
  await unhighlight(page, ctx)
  await clickIncrement(page, ctx, sloopId)
  await highlight(page, ctx, powerId, 5, 300, '.underchip')
  await unhighlight(page, ctx)
  await highlight(page, ctx, `${base.factory}-${base.product}-amount`, 6, 300)
  await unhighlight(page, ctx)
}

const scenarioFineTuning = async (page, ctx, base) => {
  await clickId(page, ctx, `${base.factory}-add-building-group`)
  await holdFrames(page, ctx, 3, 300)
  let ids = await getGroupIds(page, base.factory)
  const group2 = ids[1]
  const group1PartId = `${base.factory}-${base.group1}-parts-${base.product}-amount`
  const group2PartId = `${base.factory}-${group2}-parts-${base.product}-amount`

  await clickId(page, ctx, `${base.factory}-${base.product}-evenly-balance`)
  // Both groups land on the same value (30) — show both at once so it reads as "these
  // matched", not just "this one changed".
  await highlightTwo(page, ctx, group1PartId, group2PartId, 5, 300)
  await unhighlightTwo(page, ctx)

  await setNumberInput(page, ctx, group1PartId, 20)
  await holdFrames(page, ctx, 4, 300)
  await clickText(page, ctx, /remainder to last/i)
  await highlight(page, ctx, group2PartId, 6, 280)
  await unhighlight(page, ctx)

  // Remainder to new group: pull group2 back down to 20 too (so both groups sit at 20 of
  // the item's 60). The button creates its own third group and drops the remainder straight
  // into it — adding one by hand first would just leave a stray extra group behind.
  await setNumberInput(page, ctx, group2PartId, 20)
  await holdFrames(page, ctx, 4, 300)
  await clickText(page, ctx, /remainder to new group/i)
  await holdFrames(page, ctx, 3, 300)
  ids = await getGroupIds(page, base.factory)
  const group3 = ids[2]
  await highlight(page, ctx, `${base.factory}-${group3}-parts-${base.product}-amount`, 6, 280)
  await unhighlight(page, ctx)
}

const scenarioEffectiveBuildings = async (page, ctx, base) => {
  await clickId(page, ctx, `${base.factory}-${base.product}-toggle-sync`)
  // The readout is "<effective> | <remaining> short", split across three sibling spans with a
  // bare "|" between them, so boxing the first span alone covered only the leading figure.
  // The verb span is a v-if that disappears when the item balances, and the union simply
  // shrinks to the two figures when it does.
  await highlight(page, ctx, [
    `${base.factory}-${base.product}-effective-buildings`,
    `${base.factory}-${base.product}-remaining-buildings`,
    `${base.factory}-${base.product}-remaining-buildings-verb`,
  ], 3, 250)
  await setNumberInput(page, ctx, `${base.factory}-${base.group1}-building-count`, 2)
  await holdFrames(page, ctx, 3, 250)
  await setNumberInput(page, ctx, `${base.factory}-${base.group1}-clock`, 200)
  await holdFrames(page, ctx, 5, 260)
  await unhighlight(page, ctx)
}

const SCENARIOS = {
  groups: { base: IRON, maxGroups: 3, fn: scenarioGroups },
  sync: { base: IRON_SYNC, maxGroups: 2, fn: scenarioSync },
  overclock: { base: IRON, maxGroups: 1, fn: scenarioOverclock },
  somersloops: { base: ASSEMBLER, maxGroups: 1, fn: scenarioSomersloops },
  finetuning: { base: IRON, maxGroups: 3, fn: scenarioFineTuning },
  effectivebuildings: { base: IRON, maxGroups: 1, fn: scenarioEffectiveBuildings },
}

const which = process.argv[2] ?? 'all'

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1920,1080',
  ],
})

fs.mkdirSync(OUT, { recursive: true })

try {
  const names = which === 'all' ? Object.keys(SCENARIOS) : which.split(',')
  for (const name of names) {
    const { base, maxGroups, fn } = SCENARIOS[name]
    console.log(`=== recording ${name} ===`)
    await recordScenario(browser, name, base, maxGroups, fn)
  }
} finally {
  await browser.close()
}
