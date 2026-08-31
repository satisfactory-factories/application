---
name: rendering-rework-loader-intent
description: "Planned move to on-select (lazy) factory rendering, and how the loader should be reframed around calculation not render"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2f6112b7-ac23-484a-b1bf-92eb8058557f
  volatility: durable
  lastVerified: 2026-08-31
---

**Direction (not yet implemented as of 2026-07-20):** factories will render on an *as-selected* basis (only the selected factory materialises) instead of the current approach of rendering the whole factory list at once. The all-at-once list is what makes big plans very hard to render (see the >10-factory crash/lag warning in `Loading.vue`).

**How that reshapes the loader (`app-store.ts` loadNextFactory + `Loading.vue`):**
- The loading process should represent **calculation** steps, if any — not "factories pushed into the list."
- If nothing needs calculating (already-calculated plan, e.g. a tab switch — see [[verify-tab-navigation]] and the recalc-gate fix), it should just **load straight up**: no staggered loader, instant.
- If calculation is needed (migration / fresh / edited plan), the loader tracks the calc.

**Why:** The current `loadNextFactory` 75ms-per-factory stagger is NOT cosmetic — it paces the synchronous render of the whole list so big plans don't freeze the tab. It's load-bearing *for the current rendering model only*. Once rendering is on-select, the list is cheap and the stagger + per-factory render progress bar become obsolete.

**How to apply:** Do NOT micro-optimise the stagger (e.g. swap the 75ms for a paint-wait) before the on-select rendering lands — it'd be polishing throwaway code and could regress big-plan load jank. Fold the loader change into the rendering rework: gate the whole staggered loader behind "calculation actually happened," else load straight through.

**2026-08-31: the warning above was collected on, and the "load straight up" half of it was
wrong.** v0.7.0's instant-render path gated the whole loader on "calculation actually happened",
and the preview reported the predicted regression: a tab switch to a big plan skipped the
recalculation (correct) and the render pacing with it, so the click produced no movement and the
tab locked up. The two gates are now separate, and the size gate is the second half of the
sentence this memory was missing: **calculation is gated on the plan's state, pacing on its
size** (`needsPacedRender` / `PACED_RENDER_FACTORY_COUNT` in `web/src/utils/render-pacing.ts`,
set at the same >10 boundary `Loading.vue` warns at). A big plan takes the full staggered loader
with no recalculation in it; at or under the line, the instant path stands.

That does not change the direction here, it dates it: the stagger stays load-bearing until
on-select rendering lands, and when it does, the size gate is what should be deleted first —
the whole point of it is that mounting the list is expensive, which is the thing that rework
removes. See "Calculating and pacing the render are two questions" in [[project-sync-v7-rooms]].
