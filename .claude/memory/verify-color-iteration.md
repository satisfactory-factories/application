---
name: verify-color-iteration
description: Comparing colour/style candidates in the browser — edit the file through HMR; DOM style overrides get clobbered by Vue re-renders
metadata: 
  node_type: memory
  type: project
  originSessionId: b548d962-707a-41a2-a801-3fa069df41c7
---

When visually comparing style candidates (e.g. header colours) in the running planner, do NOT inject styles via `element.style.setProperty` in puppeteer — Vue re-renders reapply prop-driven inline styles (like Vuetify's `color` prop) and silently clobber the override, so screenshots show stale colours. Instead, rewrite the actual source file per candidate, wait ~1.5s for Vite HMR, screenshot, then restore the original. Confirm each candidate applied by reading `getComputedStyle` before trusting the screenshot. See [[verify-tab-navigation]] for the general puppeteer recipe; the verify skill documents intro-modal dismissal and MegaPlan loading.
