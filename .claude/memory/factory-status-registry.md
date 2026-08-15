---
name: factory-status-registry
description: "How to add a factory status indicator, and the two traps that make a naive implementation change hasProblem on saved plans"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0567359e-18f1-4a58-9d25-7163e4a0cbc1
  modified: 2026-08-15T18:21:07.643Z
  volatility: durable
  lastVerified: 2026-08-15
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

**There is now a third severity tier, `note`** (added 2026-08-15 with `noDemand`), for a state worth
counting that is very often deliberate. It gets a chip like any other status and is deliberately
absent from `factoryStatusClass`, so the factory keeps its colour — that exclusion is the whole
point, and re-adding it to the rollup would undo the feature. Its chip is outlined amber rather than
filled, sharing the `hand-gathered` rule in `global.scss` for the same stated reason. Two things a
new tier costs beyond one registry entry: `highestSeverity` must rank it explicitly (it used to
return `'warning'` for "anything at all applies"), and any section header keyed off
`sectionStatuses.length` rather than the severity will paint itself for a note — `ProductsAndPower`
was exactly that and had to switch to a severity switch.

Three rules settled the same day, all about *what* a zero-demand output means:

- **A product nobody wants and a byproduct nobody takes are different failures.** You can decline to
  build the first (`noDemand`, note tier); the second arrives whether you want it or not, fills the
  machine's output slot and stops the line. `factoryProducts` / `factoryByproducts` split them, and
  `noDemand` skips anything that is also a byproduct so no item is named in two chips.
- **The byproduct case splits again on whether the sink would take it**, which is the difference
  between a loose end and a wall: `potentialBlockage` (note, factory stays green) for a sinkable
  solid, `unhandledByproduct` (warning, colours the factory) for a fluid or a radioactive item.
  `sinkable.ts` owns the rule and stamps `PartMetrics.isSinkable`; the AWESOME Sink feature will
  want the same module, and its plan doc is where the rule comes from — including the hardcoded
  radioactive list that a parser `sinkPoints` field is meant to replace. See
  [[project-awesome-sink-plan]].
- **An end product is not a surplus.** `end-products.ts` derives, from the game data, the parts no
  recipe consumes; they get a blue *End product* chip instead. Consumption must count power
  generation recipes and the Alien Power Augmenter's `boost.fuelPart`, or every nuclear fuel rod and
  the Alien Power Matrix reads as terminal. The flag is stamped onto `PartMetrics.isEndProduct` in
  `parts.ts` so `status.ts` stays a leaf with no game data in it — and note that adding a field to
  `PartMetrics` breaks every spec asserting a whole part object with `toEqual`.
- **`rawShortage` is gone**, folded into `partShortage`. Being told which kind of shortage it was
  never told anyone anything they could act on. The raw half still bypasses the products-less guard
  the manufactured half obeys, so a generator burning coal it doesn't import still reports.

Status chips jump to the row that owns the problem, not just the section: any element that *is* a
subject carries `id="{factoryId}-{section}-item-{subjectId}"`, and `navigateToFactory` takes the
section as a fallback because a row inside an unmaterialized card is not in the DOM at click time.

**Why:** the design's whole value is that the next status costs one array entry. Both traps break that
promise quietly — one by making the engine slower with every status added, the other by making a
presentation feature change persisted data.

**How to apply:** read `status.ts`'s header comment before adding anything, keep the module a leaf (it
must not import anything that reaches `factory.ts` — see `inputs-analysis.ts` for why), and classify
by the tier rule: red is arithmetic, amber is judgement. See [[calc-engine-gotchas]] and
[[export-import-chain-invariants]].
