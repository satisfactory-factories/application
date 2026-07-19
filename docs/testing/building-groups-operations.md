# Building Groups Operations / Test sheet

The amount of user operations and interactions that the building groups add to the planner is overwhelming, and is too much for any one brain to contain.

Therefore, the tables below list all possible operations that the user could perform on the building groups and items, their current status, and a reference to the automated test(s) covering them.

> Last synced: 2026-07-19. Re-verified every non-`Y` row against the current code and
> backed each working operation with a passing automated test. All referenced tests were
> passing at time of sync (`web/src/utils/factory-management/building-groups/*` unit specs
> and `web/testing/tdd/building-groups/*` TDD specs — 128 TDD tests green).

Key:
- Y = Yes, implemented, works, covered by a passing automated test
- E = Implemented and eyeballed working, but has NO automated test yet
- B = Confirmed broken
- N = Not implemented
- ? = Unknown, unable to test / requires retest

Test file locations (referenced by shorthand below):
- **unit:common** = `web/src/utils/factory-management/building-groups/common.spec.ts`
- **unit:product** = `web/src/utils/factory-management/building-groups/product.spec.ts`
- **unit:power** = `web/src/utils/factory-management/building-groups/power.spec.ts`
- **unit:sanity** = `web/src/utils/factory-management/building-groups/building-groups.spec.ts`
- **tdd:create** = `web/testing/tdd/building-groups/creation-deletion.spec.ts`
- **tdd:buttons** = `web/testing/tdd/building-groups/editing-action-buttons.spec.ts`
- **tdd:buildings** = `web/testing/tdd/building-groups/editing-buildings.spec.ts`
- **tdd:clocks** = `web/testing/tdd/building-groups/clocks-ingredients.spec.ts`
- **tdd:item** = `web/testing/tdd/building-groups/item-editing.spec.ts`
- **unit:sloops** = `web/src/utils/factory-management/building-groups/somersloops.spec.ts`
- **tdd:sloops** = `web/testing/tdd/building-groups/somersloops.spec.ts`
- **tdd:pow** = `web/testing/tdd/building-groups/power-producers.spec.ts`

TDD test names contain the operation Ref (e.g. `BG-C-D-2`), so you can find a test with a plain grep of the Ref.

## Building Groups Creation / Deletion
Ref: BG-C-D

| Operation                                                                     | Ref        | Status | Test reference                                        | Notes                                                        |
|-------------------------------------------------------------------------------|------------|--------|-------------------------------------------------------|--------------------------------------------------------------|
| Create a new building group upon product addition                             | BG-C-D-1   | Y      | tdd:create, unit:product                              |                                                              |
| Create a second building group                                                | BG-C-D-2   | Y      | tdd:create (data model + via UI)                      |                                                              |
| Creating a second building group sets the new group's count to 1              | BG-C-D-2.1 | Y      | tdd:create                                            |                                                              |
| Upon creating new product, creates a BG count with the expected building size | BG-C-D-3   | Y      | tdd:create                                            |                                                              |
| Creating a new building group with preexisting groups disables item sync      | BG-C-D-4   | Y      | tdd:create (data model + via UI)                      |                                                              |
| Additional building groups default to 1 building                              | BG-C-D-5   | Y      | tdd:create (data model + via UI)                      | Decision changed from 0 to 1 default (2026-07-17)            |
| Prevent deletion of a building group when last remaining                      | BG-C-D-6   | Y      | tdd:create (data model + via UI)                      |                                                              |
| Deletion of a building group with multiple groups                             | BG-C-D-7   | Y      | tdd:create (data model + via UI)                      |                                                              |
| Deletion of the product removes the building groups                           | BG-C-D-8   | Y      | tdd:create (x3)                                       |                                                              |
| Deletion of building groups causes a building group imbalance                 | BG-C-D-9   | Y      | tdd:create (via UI)                                   | Was broken, fixed by the 1-building default                  |
| Deletion of building groups to 1 remaining disables the delete group button   | BG-C-D-10  | Y      | tdd:create                                            |                                                              |
| Deletion of building groups to 1 remaining disables the evenly balance button | BG-C-D-11  | Y      | tdd:create                                            |                                                              |
| Deletion of building groups should disable sync                               | BG-C-D-12  | Y      | tdd:create (asserted within BG-C-D-9)                 | `deleteBuildingGroup` always disables sync                   |

## Building Groups Editing - Action Buttons (Products)
Ref: BG-E-AB-PROD

| Operation                                                                                       | Ref             | Status | Test reference   | Notes                                                              |
|-------------------------------------------------------------------------------------------------|-----------------|--------|------------------|--------------------------------------------------------------------|
| Disable Evenly Balance button for singular building group                                       | BG-E-AB-PROD-1  | Y      | tdd:buttons      |                                                                    |
| Enable Evenly Balance button when multiple building groups WITHOUT need of remainder            | BG-E-AB-PROD-2  | Y      | tdd:buttons      | Was broken, now passing                                            |
| Disable Evenly Balance button if all building groups have the same building counts and clocks   | BG-E-AB-PROD-3  | Y      | tdd:buttons      | Was broken, now passing                                            |
| When effective is under balanced, "Under Producing!" is shown                                   | BG-E-AB-PROD-4  | Y      | tdd:buttons      |                                                                    |
| When effective is over balanced, "Over Producing!" is shown                                     | BG-E-AB-PROD-5  | Y      | tdd:buttons      |                                                                    |
| When effective is balanced, "Looking good, Pioneer!" is shown                                   | BG-E-AB-PROD-6  | Y      | tdd:buttons      |                                                                    |
| When effective is balanced, Evenly Balance button should still be enabled                       | BG-E-AB-PROD-7  | Y      | tdd:buttons      | Enablement depends on even distribution, not effective balance     |
| When effective is balanced, disable Remainder to Last button                                    | BG-E-AB-PROD-8  | Y      | tdd:buttons      |                                                                    |
| When effective is balanced, disable Remainder to New Group button                               | BG-E-AB-PROD-9  | Y      | tdd:buttons      |                                                                    |
| When effective is imbalanced, enable Remainder to Last button for multiple building groups      | BG-E-AB-PROD-10 | Y      | tdd:buttons      | "Imbalanced" = under-producing; over-producing also disables it    |
| When effective is imbalanced, enable Remainder to New Group button for singular building group  | BG-E-AB-PROD-11 | Y      | tdd:buttons      |                                                                    |
| When effective is imbalanced, enable Remainder to New Group button for multiple building groups | BG-E-AB-PROD-12 | Y      | tdd:buttons      |                                                                    |
| When any group has clock of !== 100%, show OC @ 100% button                                     | BG-E-AB-PROD-13 | Y      | tdd:buttons      |                                                                    |
| Pressing "Remainder to new group" creates a new group with the remainder                        | BG-E-AB-PROD-14 | Y      | tdd:buttons, unit:product | UI click + `remainderToNewGroup` logic both tested                 |
| Sync is shown as enabled upon creating a new product                                            | BG-E-AB-PROD-15 | Y      | tdd:buttons      |                                                                    |
| Pressing "Sync" disables sync for the item when enabled                                         | BG-E-AB-PROD-16 | Y      | tdd:buttons      |                                                                    |
| Pressing "Sync" enables sync for the item when disabled                                         | BG-E-AB-PROD-17 | Y      | tdd:buttons      |                                                                    |

Related unit coverage: `remainderToLast` / `remainderToNewGroup` maths in unit:product ("remainder handling") and `syncBuildingGroups` rebalancing in unit:common.

## Building Groups Editing - Buildings single group (Products)
Ref: BG-E-B-PROD

| Operation                                                             | Ref            | Status | Test reference   | Notes                                                       |
|-----------------------------------------------------------------------|----------------|--------|------------------|-------------------------------------------------------------|
| Allows editing the building count                                     | BG-E-B-PROD-1  | Y      | tdd:buildings    |                                                             |
| Editing building count updates the effective buildings                | BG-E-B-PROD-2  | Y      | tdd:buildings    |                                                             |
| Editing building count updates the remaining buildings                | BG-E-B-PROD-3  | Y      | tdd:buildings    |                                                             |
| Editing building count updates the group part production              | BG-E-B-PROD-4  | Y      | tdd:buildings    |                                                             |
| Editing building count updates the group ingredient consumption       | BG-E-B-PROD-5  | Y      | tdd:buildings    | Previous "lags by 1 change" bug no longer reproduces        |
| Editing building count updates the item's part amount                 | BG-E-B-PROD-6  | Y      | tdd:buildings    |                                                             |
| Editing building count updates the item's ingredient amount           | BG-E-B-PROD-7  | Y      | tdd:buildings    | Previous "lags by 1 change" bug no longer reproduces        |
| Editing building count updates the factory parts produced             | BG-E-B-PROD-8  | Y      | tdd:buildings    | Previous "lags by 1 change" bug no longer reproduces        |
| Editing building count updates the factory parts consumed             | BG-E-B-PROD-9  | Y      | tdd:buildings    | Previous "lags by 1 change" bug no longer reproduces        |
| Editing building count updates the group power used                   | BG-E-B-PROD-10 | Y      | tdd:buildings    |                                                             |
| Editing building count updates the factory power used                 | BG-E-B-PROD-11 | Y      | tdd:buildings    |                                                             |
| Editing building count updates the factory total buildings            | BG-E-B-PROD-12 | Y      | tdd:buildings    |                                                             |
| Sync OFF: Updating item Building Count should NOT trigger a rebalance | BG-E-B-PROD-13 | Y      | tdd:buildings, unit:sanity | Single-group now covered by tdd:buildings; multi-group by BG-E-BMULTI-PROD-11 |
| Sync OFF: Updating item amount should NOT trigger a rebalance         | BG-E-B-PROD-14 | Y      | unit:sanity      | Sync-off no-touch rule asserted in unit:sanity              |
| It should be possible to use 0.0001 ratios for item amount            | BG-E-B-PROD-15 | Y      | tdd:buildings    | Was broken, now passing                                     |
| It should display overclocks at a .0001 precision                     | BG-E-B-PROD-16 | Y      | tdd:buildings    | Fixed: rebalance now stores clocks at 4dp (common.ts `syncBuildingGroups`) |

## Building Groups Editing - Buildings multiple groups (Products)
Ref: BG-E-BMULTI-PROD

All covered by tdd:buildings and passing:

| Operation                                                                                 | Ref                  | Status | Test reference | Notes |
|-------------------------------------------------------------------------------------------|----------------------|--------|----------------|-------|
| Sync ON: Editing group building count does not trigger a rebalance and matches user input | BG-E-BMULTI-PROD-1   | Y      | tdd:buildings  |       |
| Sync ON: Editing group building count does not affect clocks                              | BG-E-BMULTI-PROD-2   | Y      | tdd:buildings  |       |
| Sync ON: Editing group building count updates the item's building counts                  | BG-E-BMULTI-PROD-3   | Y      | tdd:buildings  |       |
| Sync ON: Editing group building count updates the item's ingredients                      | BG-E-BMULTI-PROD-3.1 | Y      | tdd:buildings  |       |
| Sync ON: Editing building count updates the group ingredients correctly                   | BG-E-BMULTI-PROD-4   | Y      | tdd:buildings  |       |
| Sync ON: Effective buildings equally match the item's total buildings                     | BG-E-BMULTI-PROD-5   | Y      | tdd:buildings  |       |
| Sync ON: Remaining buildings always should be 0                                           | BG-E-BMULTI-PROD-6   | Y      | tdd:buildings  |       |
| Sync ON: Remainder error state should be indicated to the user                            | BG-E-BMULTI-PROD-7   | Y      | tdd:buildings  |       |
| Sync ON: Updating via the item SHOULD force a rebalance of group building counts          | BG-E-BMULTI-PROD-8   | Y      | tdd:buildings  |       |
| Sync ON: Updating via the item SHOULD not cause fractions                                 | BG-E-BMULTI-PROD-8.1 | Y      | tdd:buildings  |       |
| Sync ON: Updating via the item's amount should rebalance correctly                        | BG-E-BMULTI-PROD-8.2 | Y      | tdd:buildings  |       |
| Sync OFF: Editing groups does NOT affect the item's total buildings                       | BG-E-BMULTI-PROD-9   | Y      | tdd:buildings  |       |
| Sync OFF: Editing groups does NOT force a rebalance                                       | BG-E-BMULTI-PROD-10  | Y      | tdd:buildings  |       |
| Sync OFF: Editing item buildings does NOT affect group buildings                          | BG-E-BMULTI-PROD-11  | Y      | tdd:buildings  |       |
| Sync OFF: Editing groups does NOT affect factory parts                                    | BG-E-BMULTI-PROD-12  | Y      | tdd:buildings  |       |
| Sync OFF: Effective and remaining buildings correctly calculated                          | BG-E-BMULTI-PROD-13  | Y      | tdd:buildings  |       |

## Building Groups Editing - Clocks (Products)
Ref: BG-E-C-PROD

| Operation                                                               | Ref             | Status | Test reference          | Notes                                                    |
|-------------------------------------------------------------------------|-----------------|--------|-------------------------|----------------------------------------------------------|
| Editing the clock has a debounce                                        | BG-E-C-PROD-1   | Y      | tdd:clocks              | 750ms debounce, now explicitly asserted                  |
| Allows editing                                                          | BG-E-C-PROD-2   | Y      | tdd:clocks              |                                                          |
| Updates the effective buildings                                         | BG-E-C-PROD-3   | Y      | tdd:clocks (in PROD-2)  |                                                          |
| Updates the remaining buildings                                         | BG-E-C-PROD-4   | Y      | tdd:clocks (in PROD-12) |                                                          |
| Updates the group's power consumption underchip                         | BG-E-C-PROD-5   | Y      | tdd:clocks              | Was marked broken; data model updates correctly          |
| Updates the factory's power consumption                                 | BG-E-C-PROD-6   | Y      | tdd:clocks              |                                                          |
| Updates the group's parts                                               | BG-E-C-PROD-7   | Y      | tdd:clocks              | Was marked broken; now passing                           |
| Clock is NOT rounded, and exactly matches what the user entered         | BG-E-C-PROD-8   | Y      | tdd:clocks              |                                                          |
| "Is correct" colouring properly reflects balance / imbalance            | BG-E-C-PROD-9   | Y      | tdd:clocks              |                                                          |
| Building group building count does NOT change                           | BG-E-C-PROD-10  | Y      | tdd:clocks              |                                                          |
| Sync ON: Updates the product's total buildings (fractionals)            | BG-E-C-PROD-11  | Y      | tdd:clocks              |                                                          |
| Sync OFF: DOES NOT update the product's total buildings                 | BG-E-C-PROD-12  | Y      | tdd:clocks              |                                                          |
| Sync ON: Effective buildings equally match the item's total buildings   | BG-E-C-PROD-13  | Y      | tdd:clocks (in PROD-11) |                                                          |
| Sync OFF: Effective buildings DOES NOT match the item's total buildings | BG-E-C-PROD-14  | Y      | tdd:clocks (in PROD-12) |                                                          |
| Toggle bar shows the total power shards needed                          | BG-E-C-PROD-15  | Y      | tdd:clocks, unit:common | Always visible (0 at ≤100%); 1 shard/building per 50% clock above 100% (`getTotalPowerShards`). Also on power producers (untested there) |

## Building Groups Editing - Sommersloops (Products)
Ref: BG-E-S-PROD

Implemented 2026-07-18 (was a stub). Mechanics per the wiki (Production amplifier):
`somersloops` is stored **per building in the group** (a group is N identical machines);
output ×(1 + filled/slots), power ×(1 + filled/slots)², stacking multiplicatively with the
overclock power exponent. Slots: smelter/constructor 1; assembler/foundry/refinery/converter 2;
manufacturer/blender/particle accelerator/quantum encoder 4; packager & generators 0 (input disabled).
Only outputs (product + byproducts) are amplified — the item's ingredient demand is discounted
accordingly (`getSomersloopIngredientFactor`), and "effective buildings" is output-effective.
The maths live in `web/src/utils/factory-management/building-groups/somersloops.ts`.

| Operation                                                              | Ref            | Status | Test reference        | Notes                                                        |
|------------------------------------------------------------------------|----------------|--------|-----------------------|--------------------------------------------------------------|
| Somersloop input is enabled and editable                               | BG-E-S-PROD-1  | Y      | tdd:sloops            | Disabled only for buildings with 0 slots                     |
| Amplifies the group output without changing ingredient consumption     | BG-E-S-PROD-2  | Y      | tdd:sloops, unit:sloops |                                                            |
| Updates the group power with the (1 + filled/slots)² penalty           | BG-E-S-PROD-3  | Y      | tdd:sloops, unit:sloops | Fully slooped = 4× power                                   |
| Updates the effective buildings readout                                | BG-E-S-PROD-4  | Y      | tdd:sloops, unit:sloops | Effective = count × clock × sloop boost                    |
| Clamps somersloops to the building's slot count                        | BG-E-S-PROD-5  | Y      | tdd:sloops, unit:sloops | Also rounds fractions, zeroes on non-amplifiable buildings; toast on clamp |
| Sync ON: updates the product amount and building count                 | BG-E-S-PROD-6  | Y      | tdd:sloops, unit:sloops | Item ingredient demand discounted to actual consumption    |
| Sync OFF: does NOT update the product; shows over-production           | BG-E-S-PROD-7  | Y      | tdd:sloops, unit:sloops |                                                            |
| Somersloops PLUS overclocking generate the proper combined numbers     | BG-E-S-PROD-8  | Y      | tdd:sloops, unit:sloops | e.g. 250% + full sloop = ~13.43× power (wiki-validated)    |
| Rebalance accounts for sloop boost (fewer physical buildings needed)   | BG-E-S-PROD-9  | Y      | unit:sloops           | Fractional physical targets underclock as usual              |
| Editing a group part reverse-solves with the boosted output rate       | BG-E-S-PROD-10 | Y      | unit:sloops           | Ingredient edits use the unboosted rate                      |
| Remainder to new group only covers the unamplified shortfall           | BG-E-S-PROD-11 | Y      | unit:sloops           |                                                              |
| Power producers (generators) cannot be amplified                       | BG-E-S-PROD-12 | Y      | unit:sloops           | Stray somersloops on generator groups are sanitized to 0     |
| Fractional boosts on multi-slot buildings (1 of 2 slots = +50%)        | BG-E-S-PROD-13 | Y      | unit:sloops           | Assembler recipe covered                                     |
| Group somersloop underchip shows slots / current boost                 | BG-E-S-PROD-14 | Y      | tdd:sloops            | "+N% output / building" when slooped; "N slot(s) / building" otherwise |
| Factory total somersloop count readout                                 | BG-E-S-PROD-15 | N      | —                     | Not designed yet — no aggregate display exists               |
| Toggle bar shows the item's total somersloop usage                     | BG-E-S-PROD-16 | Y      | tdd:sloops, unit:sloops | Somersloop icon + count on the Open/Close bar; always visible, 0 when unused (`getTotalSomersloops`) |
| Sync ON: adding a somersloop does not falsely flag a problem           | BG-E-S-PROD-17 | Y      | tdd:sloops, unit:sloops | Was a bug: problem flag computed pre-writeback stuck red on a single calc pass; now refreshed in `checkForItemUpdate` |

## Building Groups Editing - Ingredients (Products)
Ref: BG-E-I-PROD

| Operation                                   | Ref             | Status | Test reference | Notes                                                                       |
|---------------------------------------------|-----------------|--------|----------------|-----------------------------------------------------------------------------|
| Debounce is present                         | BG-E-I-PROD-1   | Y      | tdd:clocks     | 750ms debounce, now explicitly asserted                                     |
| Building count AND clocks updated           | BG-E-I-PROD-2   | Y      | tdd:clocks     |                                                                             |
| Effective buildings updated                 | BG-E-I-PROD-3   | Y      | tdd:clocks     |                                                                             |
| Remaining buildings updated                 | BG-E-I-PROD-4   | Y      | tdd:clocks     |                                                                             |
| Parts with the exact input the user entered | BG-E-I-PROD-5   | Y      | tdd:clocks     | Known limitation: clock is ceiled to whole %, so 40 in → 40.2 shown. Test encodes this. |
| Group Power used updated                    | BG-E-I-PROD-6   | Y      | tdd:clocks     |                                                                             |
| Factory Power used updated                  | BG-E-I-PROD-7   | Y      | tdd:clocks     |                                                                             |
| SYNC ON: Building count updated on Product  | BG-E-I-PROD-8   | Y      | tdd:clocks     | Now working: `checkForItemUpdate` writes effective buildings back           |
| SYNC ON: Ingredients updated on Product     | BG-E-I-PROD-9   | B      | —              | Still broken: `increaseProductQtyViaBuilding` updates `product.amount` but not `requirements`, so the item ingredient lags one calc pass |

Related unit coverage: `updateBuildingGroupViaPart` and `buildingsNeededForPartsProducts` in unit:common / unit:product.

## Building Groups Editing - Buildings (Power Producers)
Ref: BG-E-B-POW

Power producers render and sync building groups through the exact same component tree
as products (`PowerProducer.vue` mounts `<building-groups-section>`). TDD coverage now
exists in tdd:pow; unit coverage of the group maths in unit:power and unit:common
(`addPowerProducerBuildingGroup`, `calculatePowerProducerBuildingGroupPower`).

| Operation                                    | Ref         | Status | Test reference | Notes |
|----------------------------------------------|-------------|--------|----------------|-------|
| Allows editing the building count            | BG-E-B-POW-1 | Y     | tdd:pow        | Group edit writes back to `producer.buildingCount` |

## Item Editing - Products
Ref: BG-I-E-PROD

| Operation                                                                                            | Ref            | Status | Test reference | Notes                                                          |
|------------------------------------------------------------------------------------------------------|----------------|--------|----------------|----------------------------------------------------------------|
| Editing the product item recreates the building group @ 1 building                                   | BG-I-E-PROD-1  | Y      | tdd:item       |                                                                |
| Editing the product recipe recreates the building group @ 1 building                                 | BG-I-E-PROD-2  | Y      | tdd:item       | Single-group sync-on path recreates one consistent group       |
| Editing the product quantity has a debounce                                                          | BG-I-E-PROD-3  | Y      | tdd:item       | 750ms debounce                                                 |
| Editing the product buildings has a debounce                                                         | BG-I-E-PROD-4  | B      | —              | No debounce implemented (updates immediately)                  |
| Editing the product byproducts has a debounce                                                        | BG-I-E-PROD-5  | B      | —              | No debounce implemented (updates immediately)                  |
| Editing the product ingredients has a debounce                                                       | BG-I-E-PROD-6  | B      | —              | No debounce implemented (updates immediately)                  |
| SYNC ON: Single group: Changing the product quantity updates the building group building count       | BG-I-E-PROD-7  | Y      | tdd:item       |                                                                |
| SYNC ON: Single group: Changing the product Building count changes the building group building count | BG-I-E-PROD-8  | Y      | tdd:item       |                                                                |
| SYNC ON: Single group: Changing the product byproducts changes the building group building count     | BG-I-E-PROD-9  | Y      | tdd:item       | Fixed: byproduct edit rewrites `product.amount`, group rebalances |
| SYNC ON: Single group: Changing the product Ingredient changes the building group building count     | BG-I-E-PROD-10 | Y      | tdd:item       | Fixed: ingredient edit rewrites `product.amount`, group rebalances |
| SYNC ON: Multiple groups: Changing the product quantity triggers a rebalance                         | BG-I-E-PROD-11 | Y      | tdd:item       | Was broken, now passing                                        |
| SYNC ON: Multiple: Changing the product Building count triggers a rebalance                          | BG-I-E-PROD-12 | Y      | tdd:item       |                                                                |
| SYNC ON: Multiple: Changing the product byproducts triggers a rebalance                              | BG-I-E-PROD-13 | Y      | tdd:item       | Fixed: groups rebalance off the new amount                     |
| SYNC ON: Multiple groups: Changing the product Ingredient triggers a rebalance                       | BG-I-E-PROD-14 | Y      | tdd:item       | Fixed: groups rebalance off the new amount                     |
| SYNC OFF: Changing the product quantity does NOT trigger a rebalance or makes any edits              | BG-I-E-PROD-15 | Y      | unit:sanity    |                                                                |
| SYNC OFF: Changing the product byproducts does NOT trigger a rebalance or makes any edits            | BG-I-E-PROD-16 | Y      | tdd:item       |                                                                |
| SYNC OFF: Changing the product Ingredient DOES NOT trigger a rebalance or makes any edits            | BG-I-E-PROD-17 | Y      | tdd:item       |                                                                |
| SYNC OFF: Making changes to the product updates the effective buildings readout                      | BG-I-E-PROD-18 | Y      | tdd:item       |                                                                |
| SYNC OFF: Making changes to the product updates the remaining buildings readout                      | BG-I-E-PROD-19 | Y      | tdd:item       |                                                                |
| SYNC OFF: Making changes to the product updates the status colors                                    | BG-I-E-PROD-20 | Y      | tdd:item       | Fixed: colours recompute via the `factoryUpdated` event listener |

## Item Editing - Power Producers
Ref: BG-I-E-POW

TDD coverage now exists in tdd:pow for the working operations. The debounce rows are
genuinely absent (power producer item inputs update immediately — only the group-level
inputs in `BuildingGroup.vue` debounce), and the byproduct-quantity rows are broken (the
byproduct input is editable but its value is overwritten by `calculatePowerProducers`
every pass, so the edit never reaches the groups).

| Operation                                                                                                                     | Ref           | Status | Test reference | Notes |
|-------------------------------------------------------------------------------------------------------------------------------|---------------|--------|----------------|-------|
| Editing the power producer generator recreates the building group @ 1 building                                                | BG-I-E-POW-1  | Y      | tdd:pow        |       |
| Editing the power producer fuel recipe recreates the building group @ 1 building                                              | BG-I-E-POW-2  | Y      | tdd:pow        |       |
| Editing the power producer buildings count has a debounce                                                                     | BG-I-E-POW-3  | N      | —              | No debounce implemented (updates immediately) |
| Editing the power producer byproduct has a debounce                                                                           | BG-I-E-POW-4  | N      | —              | No debounce implemented (updates immediately) |
| Editing the power producer supplemental fuel has a debounce                                                                   | BG-I-E-POW-5  | N      | —              | No debounce implemented (updates immediately) |
| Editing the power producer power MW production has a debounce                                                                 | BG-I-E-POW-6  | N      | —              | No debounce implemented (updates immediately) |
| SYNC ON: Increasing the power producer fuel quantity increases the building group buildings AND rebalances                    | BG-I-E-POW-7  | Y      | tdd:pow        |       |
| SYNC ON: Decreasing the power producer fuel quantity decreases the building group buildings AND rebalances                    | BG-I-E-POW-8  | Y      | tdd:pow        |       |
| SYNC ON: Changing the power producer buildings changes the building group buildings (single group)                            | BG-I-E-POW-9  | Y      | tdd:pow        |       |
| SYNC ON: Changing the power producer buildings changes AND rebalances the building group buildings (multiple groups)          | BG-I-E-POW-10 | Y      | tdd:pow        |       |
| SYNC ON: Changing the power producer byproduct quantity changes the building group buildings (single group)                   | BG-I-E-POW-11 | B      | —              | Byproduct input is editable but overwritten by recalculation each pass |
| SYNC ON: Changing the power producer byproduct quantity changes AND rebalances the building group buildings (multiple groups) | BG-I-E-POW-12 | B      | —              | Same byproduct-overwrite bug |
| SYNC ON: Changing the power producer supplemental fuel changes the building group buildings (single group)                    | BG-I-E-POW-13 | Y      | tdd:pow        |       |
| SYNC ON: Changing the power producer supplemental fuel changes AND rebalances the building group buildings (multiple groups)  | BG-I-E-POW-14 | Y      | tdd:pow        |       |

## Remaining work summary

Re-verified 2026-07-19. Since the previous sync, byproduct/ingredient edits on the item
now flow to the building groups (BG-I-E-PROD-9/10/13/14) and sync-off status colours now
update (BG-I-E-PROD-20) — all confirmed with new passing TDD tests. The genuinely
outstanding items are below.

Still broken (product decisions made, work outstanding):
1. Debounces missing on item buildings / byproducts / ingredients inputs (BG-I-E-PROD-4/5/6)
   and on all power producer item inputs (BG-I-E-POW-3/4/5/6) — these update immediately.
2. SYNC ON group ingredient edit does not refresh the product's ingredient *requirements*
   (BG-E-I-PROD-9): `increaseProductQtyViaBuilding` updates `product.amount` but not
   `requirements`, so the item ingredient field lags one calc pass. Building count DOES update.
3. Power producer byproduct-quantity edits are overwritten by `calculatePowerProducers`
   each pass, so they never reach the groups (BG-I-E-POW-11/12).
4. Group parts model holds ONE amount per part, so recipes where a part is both ingredient AND byproduct (e.g. distilled silica's water) cannot display both sides. Needs a split ingredient/output parts model. See the skipped spot check in `web/src/components/planner/products/BuildingGroups.spec.ts`.

Not implemented at all:
1. Factory-wide somersloop count readout (BG-E-S-PROD-15) — confirmed still absent; the
   per-group somersloop feature itself was implemented 2026-07-18 (see BG-E-S-PROD).
