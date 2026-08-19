---
name: building-group-balance-tolerance
description: "Why a group set counts as balanced within a percentage rather than a flat 0.1 buildings, and the ceiling on it"
metadata: 
  node_type: memory
  type: project
  volatility: durable
  lastVerified: 2026-08-15
  originSessionId: 7f5932c3-c5f9-4147-a9ee-2dba74876d56
  modified: 2026-08-15T16:42:07.096Z
---

Whether an item's building groups are "balanced" is decided by `balanceTolerance()` in
`utils/factory-management/building-groups/tolerance.ts`, and both consumers must go through it: the
engine's persisted `buildingGroupsHaveProblem` flag (`calculateBuildingGroupProblems`) and the
status line in `BuildingGroups.vue`. They used to carry independent copies of a flat `0.1`.

**The tolerance is a percentage of what the item asks for, defaulting to 1%, capped at 10 effective
buildings' worth.** Both halves matter:

- Flat, it means completely different things per recipe. One effective building is 60/min of
  Limestone and 15/min of Iron Rods, so 0.1 buildings let a 360/min mine read green while 6/min
  short — the report that prompted this.
- Uncapped, a percentage gets *more* generous as the item grows: 1% of a 100-building factory is a
  whole building of drift, ten times looser than the flat allowance it replaced. The ceiling is
  what stops the change loosening anything.

The setting lives in `usePlannerOptions` (per browser, not per plan) and is **range-checked on
restore** — that composable otherwise validates by `typeof`, which accepts a stored `0` or negative
and would paint every plan red with nothing on screen to explain it.

**Changing the option must force a plan recalculation.** The status line is a computed and reacts
on its own, but `buildingGroupsHaveProblem` is engine-written and saved into the plan, so without
`forceCalculation()` the tray, sidebar and factory status keep the old verdict until some unrelated
edit. Anything else that comes to depend on the tolerance inherits that obligation.

Do not confuse this with `isAmountSatisfied` in `parts.ts`, which is about clock precision at 1e-6
and is a different problem — see [[calc-engine-gotchas]] (10).
