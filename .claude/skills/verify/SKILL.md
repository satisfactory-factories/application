---
name: verify
description: How to launch and drive the web planner to verify changes end-to-end in a real browser.
---

# Verifying web planner changes at runtime

## Launch

- `pnpm dev:web` from `application/` (background it). It picks the next free port — **read the port from the Vite output** (e.g. 3002 if 3000 is taken by something else on this machine). No Docker/backend needed for planner work.
- HMR picks up edits, but do a fresh `page.goto` per test run.

## Drive (no Playwright installed)

- `/usr/bin/chromium` exists; `npm` does not — use **pnpm** to install `puppeteer-core` in the scratchpad and launch with `executablePath: '/usr/bin/chromium'`.
- **Pass `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`.** Without them, headless throttles rAF/timers: smooth `scrollIntoView` animations and `setTimeout` chains stall, producing false negatives on anything scroll- or paint-related. UI state that flashes briefly (spinners) is best asserted with an in-page `MutationObserver`, not polling via `page.evaluate`.

## Useful handles

- `http://localhost:<port>/?setupDemo=true` loads the demo plan (7 factories; "Copper Basics" has a deliberate 200/min Copper Ingot shortage — handy for satisfaction/shortage features). It fires a `confirm()` if a plan exists — auto-accept dialogs.
- Factory cards are `.main-content .v-card[id]` where `id` is the numeric factory id; the scroll container is `.main-content` (page chrome above it is ~114px).
- The sidebar factory list exists TWICE in the DOM (desktop sidebar + teleported mobile drawer) — don't count text occurrences to count factories.
- Toasts render into body text; `document.body.innerText.includes(...)` works for them.
- Factory cards lazy-materialize as they scroll into view, so far-away element positions are wrong until you've scrolled there.
