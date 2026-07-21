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
- Dev-only hook `window.__sfWatchCounter` (app-store) measures reactive churn: `.install()` adds a deep sync watcher over the plan, `.count()` reads fires. A normal edit should be ~30 fires; thousands means churn regressed.
- **An intro modal ("Welcome to Satisfactory Factories!") covers the planner on first load** — element screenshots silently capture the overlay instead of your target. Dismiss it first: find the `<button>` whose text includes "demo plan" (or "empty plan") and `.click()` it, then wait and confirm `document.querySelector('.v-overlay--active')` is gone.
- **Mael's "MegaPlan"** (big real-world plan; its "Concrete MegaFac" factory imports Limestone + Water raw resources) loads via the sidebar TEMPLATES button → the `Mael's "MegaPlan"` row button (`Templates.vue`). Loading a template overwrites the current plan without a confirm.
- Factory cards are `.main-content .v-card[id]` where `id` is the numeric factory id; the scroll container is `.main-content` (page chrome above it is ~114px).
- The sidebar factory list exists TWICE in the DOM (desktop sidebar + teleported mobile drawer) — don't count text occurrences to count factories.
- Toasts render into body text; `document.body.innerText.includes(...)` works for them.
- Factory cards lazy-materialize as they scroll into view, so far-away element positions are wrong until you've scrolled there.
