---
name: extraction-output-multiplier
description: "How mining plugs into the building-group engine — extractor mark and node purity are an output multiplier relative to the recipe's reference rate, not a new solver"
metadata: 
  node_type: memory
  type: project
  originSessionId: 69e1d33d-d5de-48d6-b095-1de878166bc4
  modified: 2026-07-30T23:50:21.185Z
---

Resource extraction (miners, oil and water extractors) reuses the existing building-group maths
instead of adding a parallel path. Each extraction recipe declares a `reference rate` —
`products[0].perMin`, which is its first extractor at normal purity (Miner Mk.1 = 60/min). A group's
mark and purity become a single **output multiplier relative to that reference**:

```
extractionMultiplier = (extractorRate(group) / referenceRate) x purityMultiplier(group)
```

So a Mk.3 group on pure nodes is `(240/60) x 2 = 8` and counts as 8 effective buildings. Because
`product.amount = referenceRate x Σ effective`, every existing formula — `syncBuildingGroups`,
`bestEffortUpdateBuildingCount`, `updateBuildingGroupViaPart`, `checkForItemUpdate` — handles mixed
marks and purities in one product with no change to the solver. Overclock composes on top
multiplicatively, as it always did.

**Why:** this is the same shape somersloops already use, so it slots into `getGroupOutputMultiplier`
alongside them rather than forking the engine. The alternative — a per-group rate the effective-
building count has to be rebuilt around — would have meant re-deriving the whole sync/rebalance
solver for one feature.

**How to apply:** anything that needs "what does this group actually produce" goes through
`getGroupOutputMultiplier(group, building, recipeId)` in `building-groups/common.ts`, never
`getSomersloopOutputMultiplier` directly. Power is the exception and is deliberately *not*
multiplied: purity doesn't change a miner's draw, and each group's power comes from its own
extractor via `getGroupExtractorPower`, since one product can mix Mk.2s and Mk.3s. Verified against
the wiki: Mk.2 on pure at 250% = 600/min and 50.4 MW; at 233.3333% = 560/min and 46 MW.
See [[calc-engine-gotchas]] for the surrounding recalculation traps.
