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

Cost scales with DATA size, not expanded DOM (collapsed vs fully-expanded plans block similarly). Fix direction (own session): replace the persistence deep watcher with event-driven debounced saves (factoryUpdated/calculationsCompleted + explicit mutation points), shallow-or-keyed watchers for the other two. Stress harness assertion is currently bounded <8s; tighten to <1s after the rework. The reveal path itself (EXPAND ALL + materializing all cards, ~294k DOM nodes) is separate — that's the parked [[rendering-rework-loader-intent]] work.
