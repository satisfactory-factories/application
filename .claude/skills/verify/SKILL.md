---
name: verify
description: How to launch and drive the web planner to verify changes end-to-end in a real browser.
---

# Verifying web planner changes at runtime

## Launch

- From `web/`: `VITE_ENV=dev pnpm exec vite --port 3005 --strictPort` (background it). No Docker/backend needed for planner work.
- **Always pin the port; never let vite land on 3001.** Matt's own dev server usually holds 3000, so a bare `pnpm dev:web` auto-increments to 3001 — which is the port vitest's global-setup gameData server binds, silently breaking the unit suite while your server runs. (And never `pkill -f vite` to clean up — that kills Matt's server too; kill your own PID.)
- HMR picks up edits, but do a fresh `page.goto` per test run. A cold vite instance can abort initial dynamic imports mid-transform (recoverable noise in `pageerror`); warm it with one throwaway `page.goto` first.

## Drive (no Playwright installed)

- `/usr/bin/chromium` exists; `npm` does not — use **pnpm** to install `puppeteer-core` in the scratchpad and launch with `executablePath: '/usr/bin/chromium'`.
- **Pass `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`.** Without them, headless throttles rAF/timers: smooth `scrollIntoView` animations and `setTimeout` chains stall, producing false negatives on anything scroll- or paint-related. UI state that flashes briefly (spinners) is best asserted with an in-page `MutationObserver`, not polling via `page.evaluate`.

## Useful handles

- **A committed harness already exists**: `web/testing/browser/reactivity.e2e.mjs` (run `PORT=3005 node testing/browser/reactivity.e2e.mjs` from `web/`) drives the demo plan and MegaPlan and asserts DOM reactivity + bounded watcher fires. Crib its selectors/waits before writing new driving code.
- `http://localhost:<port>/?setupDemo=true` loads the demo plan (9 factories; "Copper Basics" has a deliberate Copper Ingot shortage — handy for satisfaction/shortage features). It fires a `confirm()` if a plan exists — auto-accept dialogs.
- **Factory names live in the `.factory-name` input's `.value`, not in innerText** — and a card's innerText CONTAINS OTHER factories' names (export chips name requesting factories), so never `find(card => card.innerText.includes(name))`; match `card.querySelector('.factory-name input').value` exactly.
- Vuetify buttons render uppercase with embedded newlines — match button text with `b.innerText.replace(/\s+/g, ' ').trim().toUpperCase()` (e.g. the satisfaction shortage button is `+ NEW`).
- Vuetify number inputs don't select-all on triple-click; to replace a value: `click()`, then Ctrl+A, then type.
- **Vuetify `v-select` opens from its `.v-field`, not the inner `<input>`** — clicking the input does nothing. `el.closest('.v-select').querySelector('.v-field')`, dispatch `mousedown`, then `click()`.
- **There are FIVE stacked first-run modals, and suppressing one reveals the next.** Set all of them or your clicks silently land on an overlay: `dismissed-introduction: 'true'` (welcome modal), `seenV51Splash: 'true'` (the v0.5 "What's new" slideshow), `seenV6Splash: 'true'` (the v0.6 "Groundwork" deck in `SplashV6.vue`), `seenV7Splash: 'true'` (the v0.7 sync deck in `SplashV7.vue`, the only one that still auto-shows — v0.5's and v0.6's now open by hand only, but their keys still gate what `closeSplash` writes), `tutorialBuildingGroups2: 'true'` (fires on first Building Groups open). Symptom is a click that no-ops, or a full-page screenshot that is mostly deck; confirm with `document.elementFromPoint()` on the target's centre. Each release adds a key, so check `const key =` in `Splash*.vue` before trusting this list.
- **Seeding `localStorage` from a live page gets clobbered on navigation** — the app persists its in-memory plan on `pagehide`. Use `page.evaluateOnNewDocument()` so the seed lands after unload but before the app boots. It re-runs on *every* navigation, so use a fresh page (or remove the script) when you want different state later.
- **Drag and drop cannot be driven with `page.mouse`.** SortableJS (behind `vuedraggable`, used for the sidebar factory list and the tasks card) uses the native HTML5 DnD API, which CDP mouse events don't start; `page.mouse.dragAndDrop` with drag interception just hangs. Dispatch the sequence yourself — `pointerdown` + `mousedown` on the handle, then `dragstart` on the source row, `dragover` on the target, then `drop` + `dragend`, **each in its own `page.evaluate` with a sleep between**. Sortable defers its drag-started bookkeeping, so a synchronous burst of events is silently ignored. Share one `DataTransfer` across the steps (stash it on `window`).
- Dev-only hook `window.__sfWatchCounter` (app-store) measures reactive churn: `.install()` adds a deep sync watcher over the plan, `.count()` reads fires. A normal edit should be ~30 fires; thousands means churn regressed.
- **An intro modal ("Welcome to Satisfactory Factories!") covers the planner on first load** — element screenshots silently capture the overlay instead of your target. Dismiss it first: find the `<button>` whose text includes "demo plan" (or "empty plan") and `.click()` it, then wait and confirm `document.querySelector('.v-overlay--active')` is gone.
- **Mael's "MegaPlan"** (big real-world plan; its "Concrete MegaFac" factory imports Limestone + Water raw resources) loads via the sidebar TEMPLATES button → the `Mael's "MegaPlan"` row button (`Templates.vue`). Loading a template overwrites the current plan without a confirm.
- Factory cards are `.main-content .v-card[id]` where `id` is the numeric factory id; the scroll container is `.main-content` (page chrome above it is ~114px).
- The sidebar factory list exists TWICE in the DOM (desktop sidebar + teleported mobile drawer) — don't count text occurrences to count factories.
- Toasts render into body text; `document.body.innerText.includes(...)` works for them.
- Factory cards lazy-materialize as they scroll into view, so far-away element positions are wrong until you've scrolled there.

## Screenshots
- **FontAwesome renders an unknown icon as a bare ring, and `data-icon` still names what you asked for.** This build is FA5-era, so FA6 names (`fa-list-check`, `fa-wand-magic-sparkles`, `fa-share-nodes`) map but carry no path. Checking the tag or `data-icon` passes; the picture is a placeholder. Test the path instead — `el.querySelector('path').getAttribute('d').length` — and note that **every** missing icon shares one path of length 1408, so two different names reporting 1408 is the tell. FA5 equivalents: `fa-tasks`, `fa-magic`, `fa-share-alt`.
- **FontAwesome's JS replaces an `<i>` with an `<svg>` once, which takes the node out of Vue's hands.** Patching `:class` on it afterwards does nothing, so a dynamic icon shows whichever one rendered first. Keying the `<i>` is worse: Vue removes a node that is already detached and the abandoned `<svg>`s pile up. Put the `:key` on a wrapper element Vue still owns.


- **Game art is missing from a fresh capture, and no amount of waiting fixes it.** Every item and building icon goes through `GameAsset` → `GameAssetContent` → a Vuetify `v-img`, which renders **no `<img>` at all** until an `IntersectionObserver` reports it visible. A row that mounted while off screen never receives that callback, so it sits at `.v-img--booting` forever: `[...document.images]` says nothing is pending because the images are not in the DOM to be pending. Scrolling to it afterwards does not reliably fix it, and neither does walking the whole document past the viewport.
  - **What does work: change the state of the thing you are photographing.** The re-render mounts fresh `v-img`s that are already visible, and those fetch at once. So shoot a before/after pair by driving the control to the *after* state first and then stepping back, rather than in the order the pictures will be used.
  - The art is not painted the instant it reports loaded. Take the frame that needed a state change **last**, on a second pass through that state with the files already in cache.
  - Assert it: count `[...row.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth > 0)` and refuse to write a file with a row of blanks in it. It is much cheaper than noticing in review.
  - Do **not** stub `IntersectionObserver` to report everything visible. It decodes every image in the plan at once and wedges the renderer; `Page.captureScreenshot` then times out however high you push `protocolTimeout`.
- **Keep the element handle across re-renders; do not re-find by text.** Vue patches the row in place, so the original node stays correct and keeps its loaded art. Re-finding by its text after the state changed (say, the backlog warning has gone) quietly lands on a different row.
- **Suppress one-off explainers with their localStorage keys, never by clicking them away.** They animate in a beat after the value that triggers them lands, so a click at a fixed delay misses and the dialog ends up in the frame; some of them are not matched by `.v-overlay--active` either. The keys are exported next to the code that raises them: `tutorialAwesomeSink` and `tutorialDimensionalDepot` in `utils/factory-management/disposal.ts`, `dismissed-checklist-tutorial` in `ChecklistTutorial.vue`.
- **A clipped `page.screenshot({ clip })` closes overlays.** Vuetify blurs a menu or tray shut as the capture starts, so the crop lands on the planner underneath. Screenshot the whole viewport, then crop it in a canvas on a second page.
- **Trim to the element's own bounds, not to bounds plus padding.** A table row's rect plus a 10px pad takes in the rule under the row below, and the frame reads as a table someone cut in half. Inset by the 1px rules (`y + 1`, `height - 2`) and pad horizontally only.
- **Buttons duplicated at a negative `x` are the mobile drawer's copy**, not the sidebar's. Filter on `r.x >= 0 && r.x < window.innerWidth` or you will frame something that is not on screen.

## Running the real backend locally

The e2e harness's stack can be booted by hand, which is the only way to photograph anything behind an account: a stubbed session renders "Not connected" with an empty Cloud tab. `pnpm --filter backend run build`, then `VITE_ENV=dev pnpm exec vite build` from `web/`, then start `mongodb-memory-server`, `backend/dist/main.js` with `JWT_SECRET`/`MONGODB_URI`/`PORT=3001` in a temp cwd (so `@nestjs/config` cannot find `backend/.env`), and `vite preview --port 3000`. **Neither port is negotiable** — see `web/e2e/config.ts`. Register over the API (`POST /register` then `/login`, with an `X-Planner-Version` header and an `X-Forwarded-For` the rate limiter can bucket separately), then seed `token` and `loggedInUser` into localStorage. `web/e2e/helpers/` has the testids for everything: `add-tab`, `choose-local-tab`, `choose-synced-tab`, `tab-settings`, `tab-name-field`, `tab-name-apply`, `account-panel`, `plans-tab-local`, `plans-tab-cloud`, `show-plan`, `hide-plan`.
