---
name: calc-engine-gotchas
description: Non-obvious behaviors of the factory calculation engine that bite during changes
metadata: 
  node_type: memory
  type: project
  originSessionId: 3dbfec8a-0a0f-442f-9ac1-d5872e8f0b23
  modified: 2026-07-19T01:47:31.658Z
---

Gotchas in `web/src/utils/factory-management/`: (1) `calculateFactories` intentionally runs every factory **twice** — pass 1 (`loadMode`) builds part ledgers so pass 2 can judge import validity; don't "optimize" it away. (2) The step order inside `calculateFactory` is load-bearing (products → sync → power → buildings → dependencies → parts → dependency supply → building groups → power again). (3) `factory.parts` is wiped and rebuilt on every recalc — never rely on stale ledger entries. (4) Power producers solve in the direction of `producer.updated` (building/fuel/power/ingredient = whichever field the user last edited). (5) Raw resources count as always-supplied. (6) `inSync` only ever auto-transitions true→false; `null` means never synced. (7) Save-data migrations are issue-numbered patches in `app-store.ts#initFactories` — new schema fields need a patch there or old saves break. (8) `initFactories` only recalculates when a patch sets `needsCalculation` — a pure engine-formula fix silently never applies to existing saves (their stale part ledgers load as-is); pair every formula fix with a condition-based patch that detects the stale values and forces recalc (see #431 raw-supply double count).

**Why:** Each of these looks like a bug or redundancy at first glance; "fixing" them breaks the planner subtly.

**How to apply:** When touching the engine, read `docs/architecture/calculation-engine.md` first, and add a migration patch in `initFactories` whenever `FactoryInterface.ts` grows a field (note: the backend duplicates these interfaces in `backend/interfaces/`). Related: [[project-satisfactory-factories]].
