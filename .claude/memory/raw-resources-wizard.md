---
name: raw-resources-wizard
description: How the Raw Resources Wizard applies changes atomically, and why it must never mutate the live plan
metadata:
  node_type: memory
  type: project
  originSessionId: 69e1d33d-d5de-48d6-b095-1de878166bc4
  modified: 2026-08-08T01:56:32.971Z
---

The wizard (`utils/factory-management/raw-wizard.ts` + `components/planner/RawResourcesWizard.vue`)
bulk-fixes the shortages left by [[raw-input-assumption]]. One row per (factory, unmet raw part),
each choosing: a shared mine factory, extraction on the spot, an import from a factory that already
mines it, or nothing.

**`applyRawWizard` never touches the plan it is given.** It deep-clones, validates, mutates the
clone, calculates it, and returns it for the caller to commit through `appStore.setFactories()` in
one pass. This is not tidiness: `appStore.addFactory()` calls `schedulePersist()` on *every*
invocation, so mutating live means a throw halfway through leaves orphan mine factories in the saved
plan — and the app has no undo. The cost of bypassing `addFactory()` is that the wizard owns the
ID-collision repair itself (`generateFactoryId(working)` with the whole plan visible); factory IDs
key every export request, so a collision would cross two factories' wires silently.

**The sync dance when creating a mine is load-bearing.** `addProductToFactory` creates the building
group immediately on the recipe's *reference* extractor (Mk.1), so setting a Mk.2 afterwards doubles
the group's output against an unchanged product amount — a brand new mine already reporting a
building-group mismatch. Measured behaviour:

| `buildingGroupItemSync` | calc origin | outcome for 540/min on Mk.2 normal |
| --- | --- | --- |
| false | any | count stays 9, output 1080 — **mismatch** |
| **true** | **default** | **5 @ 90% = 540, correct** |
| true | `buildingGroup` | group drives the product up to 1080 |

So: set mark/purity → sync **on** → calculate → sync back **off** (the default mines are created
with, so a later mark change doesn't rewrite the quantity). Verified stable across repeated recalcs.

**Recipe identity matters on both apply paths.** `addShortageToFactory` bumps an existing product
found by part id and *discards* the recipe argument, so a factory that merely unpackages Water could
have its packaging chain expanded while the row said "import from a mine". Import candidates are
therefore restricted to factories with an actual extraction product, and on-site adds a separate
extraction product rather than bumping a non-extraction one.

`addShortageToFactory` now takes a required, validated `amount` rather than re-reading
`amountRemaining`, so the number shown in the summary is the number written. Its old `Math.abs`
would have turned a surplus into production.
