---
name: verify-export-calculator
description: Puppeteer recipe for opening the export calculator tray and driving its transport/belt sections
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5776ec76-f2d4-4c11-826d-b770ab432dd6
  modified: 2026-07-22T03:34:24.791Z
---

To drive the Export Calculator in the browser (see [[verify-tab-navigation]] for general driving setup):

- Open it by clicking an **export factory chip**, not the calculator button: `[...document.querySelectorAll('.main-content .v-table .sf-chip.factory')].find(c => c.innerText.includes('/min'))` — the `.click()` selects that destination AND opens the tray. The bare `.sf-chip.factory` selector is a trap: the sidebar Factories Summary and Statistics use the same class, and the calculator icon button (`[title="Export Calculator"]`) opens the tray with no destination selected on first use ("Please select a factory…").
- The opened tray is `.calculator-tray.expanded`. Scope belt-section queries to `.belt-section` inside it — the four vehicle calculators each have their own `.v-number-input` (round-trip secs, default 123), so unscoped input selectors hit those first.
- Belt/pipe-group persistence has no event wiring; it relies on app-store's 5s compare-and-save interval and the `pagehide` flush — a `page.goto` reload is enough to flush before asserting on `localStorage.factoryTabs`.
- To fabricate a plan state the demo lacks (e.g. a fluid export for the Pipes section), edit `localStorage.factoryTabs` in-page, then **immediately monkeypatch `Storage.prototype.setItem = () => {}`** before navigating — otherwise the app's `pagehide`/5s flush rewrites the store from memory and clobbers the injection. After the reload also click the sidebar **RECALCULATE** button: dependency requests are persisted, not rebuilt on load, so an injected input produces no export chip until a recalc runs.
