---
name: factory-status-registry
description: "How to add a factory status indicator, and the two traps that make a naive implementation change hasProblem on saved plans"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0567359e-18f1-4a58-9d25-7163e4a0cbc1
  modified: 2026-08-01T01:08:59.818Z
---

Factory status indicators (issue #506) live in `web/src/utils/factory-management/status.ts`. Adding a
new one is **one entry in `factoryStatusDefinitions` plus its spec cases** — no template edits, no
SCSS, no migration. Every display site (sidebar entry, card border and header chips, section headers,
Factories Summary row) reads the derived list rather than a named flag, so they all light up for free.
Phase 2 (`depotStarved`, #498) and phase 3 (`byproductBlocked`, #119) are meant to be exactly that.

Two traps, both found in review rather than by testing:

1. **Never call `getFactoryStatuses` from the engine.** `calculateHasProblem` runs for every factory
   at the end of every factory's calculation, and the engine runs per factory twice — on the order of
   30,000 invocations for a 124-factory plan. The full status list evaluates the O(inputs²) import
   predicates. The engine calls `hasFactoryProblem` instead, which walks problem-tier definitions only
   and bails on the first hit.
2. **Mirror the product-less guard in `calculateParts`.** It sets `requirementsSatisfied = true`
   whenever `products.length === 0`, *even when the factory has unsatisfied fuel ingredients*. Shortage
   detectors that ignore that guard turn power-only factories red and silently change `hasProblem` on
   plans people have already saved. `status-regression.spec.ts` pins the rollup against a verbatim copy
   of the pre-#506 algorithm so this can't drift.

A third thing worth knowing: a power producer's `id` is a random instance number, not an item id, so
building-group statuses carry `producer.building` with `type: 'building'`. That's why status subjects
are `{ id, type }` rather than bare part ids.

**Why:** the design's whole value is that the next status costs one array entry. Both traps break that
promise quietly — one by making the engine slower with every status added, the other by making a
presentation feature change persisted data.

**How to apply:** read `status.ts`'s header comment before adding anything, keep the module a leaf (it
must not import anything that reaches `factory.ts` — see `inputs-analysis.ts` for why), and classify
by the tier rule: red is arithmetic, amber is judgement. See [[calc-engine-gotchas]] and
[[export-import-chain-invariants]].
