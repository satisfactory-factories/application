---
name: perf-deep-watcher-bottleneck
description: Next perf bottleneck after the diff-commit fix — three full-plan deep watchers + persistence stringify make edits block ~4-6.5s on 124-factory plans
metadata: 
  node_type: memory
  type: project
  originSessionId: 1edcf2db-7646-4b93-8d8b-d62656dc0fb0
---

Measured 2026-07-21 with the browser stress harness (`web/testing/browser/stress.e2e.mjs`, 124-factory plan via `createStressPlan(4)` / dev hook `window.__sfLoadStressPlan`): after the [[perf-devtools-sync-watcher]] diff-commit fix, calculation churn is solved (37 watcher fires, ~65 DOM mutations per edit; no-op recalc of 124 factories = 0 fires, ~240ms), **but an edit still blocks the main thread ~4–6.5s** (dev mode). CPU profile attribution per edit:

- ~2.3s: `traverse` + reactive `get`/`ownKeys` — the THREE full-plan deep watchers re-traverse all 124 factories through proxies on every flush:
  1. `app-store.ts` localStorage persistence watcher (`watch(factoryTabs.value, ..., {deep:true})`)
  2. `PlannerFactoryList.vue:216` (`factoriesCopy` refresh, deep)
  3. `StatisticsFactorySummary.vue:327` (deep-watches all factories just to adjust table height)
- ~1.9s `(program)`: mostly the persistence `JSON.stringify` of the whole plan (native, hidden in program samples)
- ~1s: Vuetify props/update machinery from broad component sweeps (validateProps/setFullProps/VTooltip)

FIXED (same branch `perf/reactive-diff-commit`, later on 2026-07-21): all three deep watchers eliminated — persistence is event-driven (debounced save on factoryUpdated/calculationsCompleted + explicit schedulePersist in tab mutators/setFactories, `JSON.stringify(toRaw(...))` for speed, 10s compare-and-save interval + pagehide/visibilitychange flush as the safety net for direct mutations like renames); PlannerFactoryList watches an id-fingerprint; StatisticsFactorySummary watches row count. Browser-verified that a non-calc rename survives reload via the pagehide flush.

ALSO CRITICAL: `vite-plugin-vue-devtools` embedded the full devtools backend (incl. pinia's deep+sync $subscribe from [[perf-devtools-sync-watcher]]) into EVERY dev page, no extension needed — now opt-in via `VITE_DEVTOOLS=true` in vite.config.mts. Don't re-enable it unconditionally.

Post-fix profile: `traverse` gone entirely; 124-factory edit settle ~2.5–3.5s measured (the stress harness's own __sfWatchCounter deep sync watcher inflates this — real settle lower). Remaining cost: Vuetify component-update sweep (~1.5s) + native style/layout over the ~294k-node fully-expanded DOM (in `(program)` samples) — that's the parked [[rendering-rework-loader-intent]] work. Stress harness bound now <5s. Note: `Graph.vue:78` still has an implicit-deep `watch(factories, ...)` that rebuilds the whole graph per change — only mounted on /graph, left for the graph rebuild plan.
