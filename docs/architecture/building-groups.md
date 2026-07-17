# Building groups (overclocking & somersloops)

> Status snapshot below reflects branch `11-product-building-groups` as of 2026-07-17 with uncommitted changes in the working tree. The living per-operation status sheet is `docs/testing/building-groups-operations.md`.

## What a building group is

A product's building count (e.g. "2.5 smelters") is abstract; in the real game the player builds concrete machines at specific clock speeds. A **building group** is a slice of an item's production: N physical buildings at one overclock percent. An item (product or power producer) owns `buildingGroups: BuildingGroup[]`, and the groups together are meant to reconcile against the item's target output.

```ts
// web/src/interfaces/planner/FactoryInterface.ts
interface BuildingGroup {
  id: number
  buildingCount: number
  overclockPercent: number            // 100 = stock, capped at 250
  parts: { [part: string]: number }   // this group's per-part throughput (ingredients + outputs)
  powerUsage: number                  // products
  powerProduced: number               // power producers
  somersloops?: number                // modeled but NOT implemented — UI slot is disabled ("Coming soon!")
  type: ItemType                      // Product | Power
}
```

Items also carry three flags: `buildingGroupsTrayOpen` (UI), `buildingGroupsHaveProblem` (|required − effective| > 0.1), and `buildingGroupItemSync` — the important one.

## Core arithmetic (`web/src/utils/factory-management/building-groups/common.ts`)

- **Effective buildings** = Σ `buildingCount × overclock/100`. Overclock is a *linear* production multiplier. "Remaining" = item's required buildings − effective (negative = over-producing).
- **Power**: product groups use the true game formula `basePower × (clock/100)^1.321928 × count`; power-producer groups scale linearly.
- **Group parts** (`calculateBuildingGroupParts`): the item's parts split proportionally per building, times the clock multiplier.
- **Best-effort solving** (`bestEffortUpdateBuildingCount`): given a target amount, search whole building counts preferring **clock ≤ 100%** (more buildings beats overclocking — power shards are scarce). Reverse edits (user types a part amount → derive count + clock) live in `updateBuildingGroupViaPart`, capping clock at 250%.
- **Balancing actions**: `syncBuildingGroups` (even split; remainder handled by ceiling buildings and underclocking so effective output matches target), `remainderToLast`, `remainderToNewGroup`, "OC @ 100%".

`product.ts` and `power.ts` are thin type-specific wrappers (power groups pull ingredients/byproduct from the power recipe).

## The sync flag — the heart of the UX rules

`buildingGroupItemSync` decides which direction edits flow:

- **Sync ON** (default for a new product): the item and its groups are bidirectionally coupled. Editing the *item* (quantity, building count) force-rebalances the groups (whole buildings, no fractions). Editing a *group* writes totals back up to the item (`checkForItemUpdate`) but must NOT trigger a rebalance of sibling groups (that would stomp the user's input — the calc pipeline passes `origin: 'buildingGroup'` to prevent this).
- **Sync OFF**: groups are the user's manual ground truth. Group edits don't touch the item; item edits don't touch groups; the effective/remaining readout shows the (possibly intentional) imbalance.
- Sync is **auto-disabled** when the user adds a second group (they're taking manual control) and stays disabled after deleting back down to one group (intentional imbalance is preserved).

The engine hook: `calculateFactory` calls `syncBuildingGroups(...)` per item, which rebalances only when `modes.forceRebalance || (modes.origin !== 'buildingGroup' && item.buildingGroupItemSync)`. Explicit "Evenly balance" button clicks pass `forceRebalance: true`.

## UI (`web/src/components/planner/products/`)

- `BuildingGroups.vue` — container: group list, "Effective Buildings | N short/over" status line with an over/under/"Looking good, Pioneer!" chip, sync toggle, and action buttons (Add group, Evenly balance, Remainder to last, Remainder to new group, OC @ 100%, Tutorial). Button enablement is driven by balance state (`isEvenlyBalanced`).
- `BuildingGroup.vue` — one row: building count, overclock % (debounced 750 ms, max 250), disabled somersloop slot, editable per-part chips (editing a part reverse-solves count+clock), per-group power, delete (disabled when it's the last group).
- Group edits call `updateFactory(factory, { useBuildingGroupBuildings: true, origin: 'buildingGroup' })`.

## Testing

- Unit specs: `web/src/utils/factory-management/building-groups/*.spec.ts`.
- Behavior/TDD specs: `web/testing/tdd/building-groups/` (creation-deletion, editing-action-buttons, editing-buildings, clocks-ingredients, item-editing) — mounted real components, test names reference the operation IDs in `docs/testing/building-groups-operations.md`.

## Work-in-progress state (snapshot 2026-07-17, uncommitted tree)

Substantially built and mostly green (~112/119 unit, ~57/69 TDD passing), mid-refactor. Known open fronts:

1. **New-group default count contradiction**: `createBuildingGroup` currently defaults *additional* groups to 0 buildings, while the CHANGELOG and the `BG-C-D-2/2.1/5` tests expect 1. Largest failure cluster (creation-deletion TDD).
2. **Remainder refactor unreconciled**: `bestEffortUpdateBuildingCount` changed signature (explicit per-group target instead of dividing the item total); `remainderToLast`/`remainderToNewGroup` unit tests fail on clock percentages and a 0-vs-1 building count.
3. **Power-producer group creation**: 2 failing unit tests (building count, parts).
4. **Sync-off leak**: one case where a product amount change still updates groups with sync off; clock-edit TDD (`BG-E-C-PROD-2/11/12`) also failing.
5. **Somersloops**: pure stub — field exists, UI disabled, no math. (The status sheet section `BG-E-S-PROD` says "NOT IMPLEMENTED".)
6. Working-tree artifacts: `product_spec_full.txt` at repo root is **captured vitest console output**, not a spec — a stale debugging artifact; `.DS_Store` files.

The `power.ts` change on this branch (outside building-groups): `updateViaIngredient` falls back to `updateViaFuel` when a power recipe has no supplemental ingredient.
