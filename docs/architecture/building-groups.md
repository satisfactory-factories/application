# Building groups (overclocking & somersloops)

> Status snapshot below reflects branch `11-product-building-groups` as of 2026-07-18 with uncommitted changes in the working tree. The living per-operation status sheet is `docs/testing/building-groups-operations.md`.

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
  somersloops?: number                // somersloops PER BUILDING in the group (0..slots), clamped by building type
  type: ItemType                      // Product | Power
}
```

Items also carry three flags: `buildingGroupsTrayOpen` (UI), `buildingGroupsHaveProblem` (|required − effective| > 0.1), and `buildingGroupItemSync` — the important one.

## Core arithmetic (`web/src/utils/factory-management/building-groups/common.ts`)

- **Effective buildings** = Σ `buildingCount × overclock/100 × sloopBoost`. Overclock is a *linear* production multiplier; so is the somersloop boost, making "effective" mean *output*-effective. "Remaining" = item's required buildings − effective (negative = over-producing).
- **Power**: product groups use the true game formula `basePower × (clock/100)^1.321928 × (1 + sloops/slots)² × count`; power-producer groups scale linearly (and cannot be amplified).
- **Group parts** (`calculateBuildingGroupParts`): the item's parts split proportionally per building, times the clock multiplier. Somersloops multiply *outputs only* (product + byproducts) by `1 + sloops/slots`; ingredients are never amplified.
- **Somersloops** (`building-groups/somersloops.ts`): slot counts per building are hardcoded there (not in gamedata): smelter/constructor 1, assembler/foundry/refinery/converter 2, manufacturer/blender/hadroncollider/quantumencoder 4, packager & generators 0. `somersloops` is per building in the group (a group is N *identical* machines — mixed sloop configs mean multiple groups). Because sloops boost output without extra input, the item's amount-derived ingredient demand is discounted by `getSomersloopIngredientFactor` (= physical-effective ÷ output-effective across groups; exactly 1 with no sloops) in `calculateProducts`, and that factor is divided back out inside the group part split so group ingredient rates stay recipe-exact. Fully slooped at 250% clock draws ~13.43× base power (wiki-validated).
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

- `BuildingGroups.vue` — container, rendered as a tray under the item behind a full-width "Open/Close Building Groups" toggle bar (in `Product.vue`/`PowerProducer.vue`; chevron up closed / down open; red + warning text when groups have a problem). Tray order: action buttons first (Evenly balance, Remainder to last, Remainder to new group, OC @ 100%), then the "Effective Buildings | N short/over" status line with an over/under/"Looking good, Pioneer!" chip + sync toggle + Tutorial, then the group rows, then "Add Building Group" centered at the bottom. Button enablement is driven by balance state (`isEvenlyBalanced`).
- `BuildingGroup.vue` — one row: building count, overclock % (debounced 750 ms, max 250), somersloop input (enabled, clamped to the building's slot count, underchip shows slots / current boost; disabled with "Cannot be amplified" for 0-slot buildings), editable per-part chips (editing a part reverse-solves count+clock), per-group power, delete (disabled when it's the last group).
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
5. **Somersloops**: implemented 2026-07-18 — full math (output boost, squared power penalty, overclock stacking, ingredient discount), enabled UI, unit suite (`somersloops.spec.ts`) and TDD suite (`tdd/building-groups/somersloops.spec.ts`). See status sheet section `BG-E-S-PROD`. No factory-wide somersloop count readout yet.
6. Working-tree artifacts: `product_spec_full.txt` at repo root is **captured vitest console output**, not a spec — a stale debugging artifact; `.DS_Store` files.

The `power.ts` change on this branch (outside building-groups): `updateViaIngredient` falls back to `updateViaFuel` when a power recipe has no supplemental ingredient.
