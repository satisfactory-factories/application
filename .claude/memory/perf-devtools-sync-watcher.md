---
name: perf-devtools-sync-watcher
description: "Root cause of the \"adding a factory hangs\" bug — Pinia devtools installs a deep+sync watcher making calculateFactories O(n²); prod builds unaffected"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1edcf2db-7646-4b93-8d8b-d62656dc0fb0
---

Investigated 2026-07-21: the massive hang when adding a factory/product on plans (worst on large ones) is **not** a calc-engine cascade — one click runs exactly one `calculateFactories`, and the engine itself is fast (~31ms plain for 72 factories).

Root cause: when the Vue Devtools extension backend is connected, Pinia's devtools plugin calls `store.$subscribe(cb, { detached: true, flush: 'sync' })`, and `$subscribe` = `watch(() => pinia.state.value[$id], cb, { deep: true, ...opts })`. Result: **every reactive write** inside `calculateFactories` synchronously deep-traverses the entire app-store state (ALL factory tabs) and pushes inspector/timeline updates to the extension → O(writes × state size) ≈ O(n²).

Benchmark (vitest, deep+sync no-op watcher simulating devtools; bench spec kept out of the suite — copy lives in session scratchpad, trivially recreatable):
- 9 factories: plain 6.7ms → watched 2,896ms (fired 2,430×)
- 36 factories: plain 13.2ms → watched 52,084ms (fired 10,752×)
- 72 factories: plain 31.4ms → watched 233,764ms (~4 min, fired 24,228×)
Real devtools is worse still (per-fire `sendInspectorState` postMessage to the extension). Vue Devtools v7 hooks in even with the panel closed.

Secondary (not the hang): reactive-proxy overhead makes calc ~6× slower than plain even without devtools (192ms vs 31ms @ 72 facs), and `app-store.ts:102`'s deep watcher `JSON.stringify`s all tabs to localStorage once per tick per edit.

FIXED (branch `perf/reactive-diff-commit`, 2026-07-21): `calculateFactory`/`calculateFactories` now clone-run-commit — engine runs on `structuredClone(toRaw(plan))`, then `applyDiff` (commit.ts) writes only genuine changes back through the reactive objects, preserving identity. No-op recalc = 0 watcher fires (was ~2,400); real edits ≈ 30 fires in-browser (measured via the dev-only `window.__sfWatchCounter` hook in app-store). `factoryUpdated` now only emitted for changed factories (+ always the directly calculated one). Engine-internal nested calls are guarded by a clone-run depth counter — internal code keeps calling the public names. Also fixed `setFactories` aliasing `previousInputs` to `inputs`. Browser harness: `web/testing/browser/reactivity.e2e.mjs`. No per-store devtools opt-out exists in pinia (checked 4.0.2); the clone approach makes it moot.

Also found: `building-groups/common.ts` does top-level `await fetchGameData()` (HTTP), so specs importing it fail in plain `vitest run` unless something serves gameData on :3001 — `setup-vitest.ts` mocks the store loader but not `gameDataService`.
