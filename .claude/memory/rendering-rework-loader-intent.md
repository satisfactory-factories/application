---
name: rendering-rework-loader-intent
description: "Planned move to on-select (lazy) factory rendering, and how the loader should be reframed around calculation not render"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2f6112b7-ac23-484a-b1bf-92eb8058557f
---

**Direction (not yet implemented as of 2026-07-20):** factories will render on an *as-selected* basis (only the selected factory materialises) instead of the current approach of rendering the whole factory list at once. The all-at-once list is what makes big plans very hard to render (see the >10-factory crash/lag warning in `Loading.vue`).

**How that reshapes the loader (`app-store.ts` loadNextFactory + `Loading.vue`):**
- The loading process should represent **calculation** steps, if any — not "factories pushed into the list."
- If nothing needs calculating (already-calculated plan, e.g. a tab switch — see [[verify-tab-navigation]] and the recalc-gate fix), it should just **load straight up**: no staggered loader, instant.
- If calculation is needed (migration / fresh / edited plan), the loader tracks the calc.

**Why:** The current `loadNextFactory` 75ms-per-factory stagger is NOT cosmetic — it paces the synchronous render of the whole list so big plans don't freeze the tab. It's load-bearing *for the current rendering model only*. Once rendering is on-select, the list is cheap and the stagger + per-factory render progress bar become obsolete.

**How to apply:** Do NOT micro-optimise the stagger (e.g. swap the 75ms for a paint-wait) before the on-select rendering lands — it'd be polishing throwaway code and could regress big-plan load jank. Fold the loader change into the rendering rework: gate the whole staggered loader behind "calculation actually happened," else load straight through.
