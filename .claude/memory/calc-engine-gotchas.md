---
name: calc-engine-gotchas
description: Non-obvious behaviors of the factory calculation engine that bite during changes
metadata: 
  node_type: memory
  type: project
  originSessionId: 3dbfec8a-0a0f-442f-9ac1-d5872e8f0b23
  modified: 2026-07-19T01:47:31.658Z
  volatility: durable
  lastVerified: 2026-08-14
---

Gotchas in `web/src/utils/factory-management/`: (1) `calculateFactories` intentionally runs every factory **twice** — pass 1 (`loadMode`) builds part ledgers so pass 2 can judge import validity; don't "optimize" it away. (2) The step order inside `calculateFactory` is load-bearing (products → sync → power → buildings → dependencies → parts → dependency supply → building groups → power again). (3) `factory.parts` is wiped and rebuilt on every recalc — never rely on stale ledger entries. (4) Power producers solve in the direction of `producer.updated` (building/fuel/power/ingredient = whichever field the user last edited). (5) Raw resources count as always-supplied. (6) `inSync` only ever auto-transitions true→false; `null` means never synced. (7) Save-data migrations are issue-numbered patches in `app-store.ts#initFactories` — new schema fields need a patch there or old saves break. (8) `initFactories` only recalculates when a patch sets `needsCalculation` — a pure engine-formula fix silently never applies to existing saves (their stale part ledgers load as-is); pair every formula fix with a condition-based patch that detects the stale values and forces recalc. **An existing patch touching the same field is not coverage — read its condition.** v0.6 stopped assuming raw supply and #431 already watched `amountSuppliedViaRaw`, but only for the *over*-supply case (`> rawShortfall`), and in an ordinary old plan the two are exactly equal. So nothing fired: plans loaded green, no factory turned red, the breaking-change notice never showed and the wizard reported nothing to fix. Write the detector from the invariant the new formula creates (post-v0.6, only hand-gathered parts may carry raw supply), not from what looks adjacent. (9) **Never assign a reactive array's `filter()`/`map()` result back onto a factory** — the derived array's *elements* are proxies, `structuredClone` (how `cloneForCalculation` copies the plan) refuses a Proxy, and every later calculation throws mid-call, skipping whatever came after it. Use `rawArray()` from `factory-management/common.ts`; `reactivity.spec.ts` guards this and asserts the engine's deep-unwrap fallback never has to fire.

(10) **Satisfaction is compared with a tolerance, deliberately** (`isAmountSatisfied` in `parts.ts`, used by `dependencies.ts` too). A building group solved against a target has to express its clock in the four decimal places the game allows, so on a large line it lands a hair under and can never be corrected — a self-sufficient 10,000/min mine came out 0.009 short and went red with nothing the user could do. Four decimal places of a percentage is a relative precision of 1e-6, which is where the tolerance comes from; it is not a fudge factor and must not be simplified back to `>= 0`. It never showed below about 1,000/min, which is why it read as arbitrary.

**Why:** Each of these looks like a bug or redundancy at first glance; "fixing" them breaks the planner subtly.

**How to apply:** When touching the engine, read `docs/architecture/calculation-engine.md` first, and add a migration patch in `initFactories` whenever `FactoryInterface.ts` grows a field (note: the backend duplicates these interfaces in `backend/interfaces/`). Related: [[project-satisfactory-factories]].
