# Building Groups Operations / Test sheet

The amount of user operations and interactions that the building groups add to the planner is overwhelming, and is too much for any one brain to contain.

Therefore, the tables below list all possible operations that the user could perform on the building groups and items, their current status, and a reference to the automated test(s) covering them.

> Last synced: 2026-07-17. All referenced tests were passing at time of sync
> (`web/src/utils/factory-management/building-groups/*` unit specs and `web/testing/tdd/building-groups/*` TDD specs).

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
| When effective is balanced, Evenly Balance button should still be enabled                       | BG-E-AB-PROD-7  | ?      | —                | Needs a test; see BG-E-AB-PROD-2/3 for the current enablement rules |
| When effective is balanced, disable Remainder to Last button                                    | BG-E-AB-PROD-8  | E      | —                |                                                                    |
| When effective is balanced, disable Remainder to New Group button                               | BG-E-AB-PROD-9  | E      | —                |                                                                    |
| When effective is imbalanced, enable Remainder to Last button for multiple building groups      | BG-E-AB-PROD-10 | ?      | —                | Forced-rebalance bug is fixed; needs retest + test                 |
| When effective is imbalanced, enable Remainder to New Group button for singular building group  | BG-E-AB-PROD-11 | ?      | —                | Forced-rebalance bug is fixed; needs retest + test                 |
| When effective is imbalanced, enable Remainder to New Group button for multiple building groups | BG-E-AB-PROD-12 | ?      | —                | Forced-rebalance bug is fixed; needs retest + test                 |
| When any group has clock of !== 100%, show OC @ 100% button                                     | BG-E-AB-PROD-13 | Y      | tdd:buttons      |                                                                    |
| Pressing "Remainder to new group" creates a new group with the remainder                        | BG-E-AB-PROD-14 | Y/E    | unit:product (`remainderToNewGroup`) | Logic unit-tested and passing; UI click itself untested            |
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
| Sync OFF: Updating item Building Count should NOT trigger a rebalance | BG-E-B-PROD-13 | E      | unit:sanity (partial) | Multi-group variant covered by BG-E-BMULTI-PROD-11        |
| Sync OFF: Updating item amount should NOT trigger a rebalance         | BG-E-B-PROD-14 | Y      | unit:sanity      | Sync-off no-touch rule asserted in unit:sanity              |
| It should be possible to use 0.0001 ratios for item amount            | BG-E-B-PROD-15 | Y      | tdd:buildings    | Was broken, now passing                                     |
| It should display overclocks at a .0001 precision                     | BG-E-B-PROD-16 | B      | —                | Still displaying at 0.001 (3dp) precision                   |

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
| Editing the clock has a debounce                                        | BG-E-C-PROD-1   | E      | tdd:clocks (implicit)   | 750ms debounce; the clock tests rely on it to pass       |
| Allows editing                                                          | BG-E-C-PROD-2   | Y      | tdd:clocks              |                                                          |
| Updates the effective buildings                                         | BG-E-C-PROD-3   | Y      | tdd:clocks (in PROD-2)  |                                                          |
| Updates the remaining buildings                                         | BG-E-C-PROD-4   | Y      | tdd:clocks (in PROD-12) |                                                          |
| Updates the group's power consumption underchip                         | BG-E-C-PROD-5   | Y      | tdd:clocks              | Was marked broken; data model updates correctly          |
| Updates the factory's power consumption                                 | BG-E-C-PROD-6   | E      | —                       |                                                          |
| Updates the group's parts                                               | BG-E-C-PROD-7   | Y      | tdd:clocks              | Was marked broken; now passing                           |
| Clock is NOT rounded, and exactly matches what the user entered         | BG-E-C-PROD-8   | E      | —                       |                                                          |
| "Is correct" colouring properly reflects balance / imbalance            | BG-E-C-PROD-9   | E      | —                       |                                                          |
| Building group building count does NOT change                           | BG-E-C-PROD-10  | E      | —                       |                                                          |
| Sync ON: Updates the product's total buildings (fractionals)            | BG-E-C-PROD-11  | Y      | tdd:clocks              |                                                          |
| Sync OFF: DOES NOT update the product's total buildings                 | BG-E-C-PROD-12  | Y      | tdd:clocks              |                                                          |
| Sync ON: Effective buildings equally match the item's total buildings   | BG-E-C-PROD-13  | Y      | tdd:clocks (in PROD-11) |                                                          |
| Sync OFF: Effective buildings DOES NOT match the item's total buildings | BG-E-C-PROD-14  | Y      | tdd:clocks (in PROD-12) |                                                          |

## Building Groups Editing - Sommersloops (Products)
Ref: BG-E-S-PROD

NOT IMPLEMENTED — data model field and disabled UI slot exist only ("Coming soon!").

## Building Groups Editing - Ingredients (Products)
Ref: BG-E-I-PROD

| Operation                                   | Ref             | Status | Test reference | Notes                                                                       |
|---------------------------------------------|-----------------|--------|----------------|-----------------------------------------------------------------------------|
| Debounce is present                         | BG-E-I-PROD-1   | E      | tdd:clocks (implicit) |                                                                       |
| Building count AND clocks updated           | BG-E-I-PROD-2   | Y      | tdd:clocks     |                                                                             |
| Effective buildings updated                 | BG-E-I-PROD-3   | E      | —              |                                                                             |
| Remaining buildings updated                 | BG-E-I-PROD-4   | E      | —              |                                                                             |
| Parts with the exact input the user entered | BG-E-I-PROD-5   | Y      | tdd:clocks     | Known limitation: clock is ceiled to whole %, so 40 in → 40.2 shown. Test encodes this. |
| Group Power used updated                    | BG-E-I-PROD-6   | E      | —              |                                                                             |
| Factory Power used updated                  | BG-E-I-PROD-7   | E      | —              |                                                                             |
| SYNC ON: Building count updated on Product  | BG-E-I-PROD-8   | ?      | —              | Was marked broken pre-rebalance-fix; needs retest + test                    |
| SYNC ON: Ingredients updated on Product     | BG-E-I-PROD-9   | ?      | —              | Was marked broken pre-rebalance-fix; needs retest + test                    |

Related unit coverage: `updateBuildingGroupViaPart` and `buildingsNeededForPartsProducts` in unit:common / unit:product.

## Building Groups Editing - Buildings (Power Producers)
Ref: BG-E-B-POW

NOT TESTED — no TDD coverage exists yet. Unit coverage of the group maths only:
group creation and parts in unit:power and unit:common (`addPowerProducerBuildingGroup`),
power generation maths in unit:common (`calculatePowerProducerBuildingGroupPower`, wiki/in-game validated numbers).

| Operation                                    | Ref         | Status | Test reference | Notes |
|----------------------------------------------|-------------|--------|----------------|-------|
| Allows editing the building count            | BG-E-B-POW-1 | ?     | —              | TO ADD MORE |

## Item Editing - Products
Ref: BG-I-E-PROD

| Operation                                                                                            | Ref            | Status | Test reference | Notes                                                          |
|------------------------------------------------------------------------------------------------------|----------------|--------|----------------|----------------------------------------------------------------|
| Editing the product item recreates the building group @ 1 building                                   | BG-I-E-PROD-1  | Y      | tdd:item       |                                                                |
| Editing the product recipe recreates the building group @ 1 building                                 | BG-I-E-PROD-2  | ?      | —              | Was P/B: updated the group but not the item buildings. Retest  |
| Editing the product quantity has a debounce                                                          | BG-I-E-PROD-3  | E      | —              |                                                                |
| Editing the product buildings has a debounce                                                         | BG-I-E-PROD-4  | B      | —              | No debounce implemented                                        |
| Editing the product byproducts has a debounce                                                        | BG-I-E-PROD-5  | B      | —              | No debounce implemented                                        |
| Editing the product ingredients has a debounce                                                       | BG-I-E-PROD-6  | B      | —              | No debounce implemented                                        |
| SYNC ON: Single group: Changing the product quantity updates the building group building count       | BG-I-E-PROD-7  | Y      | tdd:item       |                                                                |
| SYNC ON: Single group: Changing the product Building count changes the building group building count | BG-I-E-PROD-8  | Y      | tdd:item       |                                                                |
| SYNC ON: Single group: Changing the product byproducts changes the building group building count     | BG-I-E-PROD-9  | B      | —              | Does not change the group at all                               |
| SYNC ON: Single group: Changing the product Ingredient changes the building group building count     | BG-I-E-PROD-10 | B      | —              | Does not change the group at all                               |
| SYNC ON: Multiple groups: Changing the product quantity triggers a rebalance                         | BG-I-E-PROD-11 | Y      | tdd:item       | Was broken, now passing                                        |
| SYNC ON: Multiple: Changing the product Building count triggers a rebalance                          | BG-I-E-PROD-12 | Y      | tdd:item       |                                                                |
| SYNC ON: Multiple: Changing the product byproducts triggers a rebalance                              | BG-I-E-PROD-13 | B      | —              | Does not change the groups at all                              |
| SYNC ON: Multiple groups: Changing the product Ingredient triggers a rebalance                       | BG-I-E-PROD-14 | B      | —              | Does not change the groups at all                              |
| SYNC OFF: Changing the product quantity does NOT trigger a rebalance or makes any edits              | BG-I-E-PROD-15 | Y      | unit:sanity    |                                                                |
| SYNC OFF: Changing the product byproducts does NOT trigger a rebalance or makes any edits            | BG-I-E-PROD-16 | E      | —              |                                                                |
| SYNC OFF: Changing the product Ingredient DOES NOT trigger a rebalance or makes any edits            | BG-I-E-PROD-17 | E      | —              | Was also updating remaining                                    |
| SYNC OFF: Making changes to the product updates the effective buildings readout                      | BG-I-E-PROD-18 | E      | —              |                                                                |
| SYNC OFF: Making changes to the product updates the remaining buildings readout                      | BG-I-E-PROD-19 | E      | —              |                                                                |
| SYNC OFF: Making changes to the product updates the status colors                                    | BG-I-E-PROD-20 | B      | —              | The colours are not updating with new effective building state |

## Item Editing - Power Producers
Ref: BG-I-E-POW

NOT TESTED — no TDD coverage exists yet.

| Operation                                                                                                                     | Ref           | Status | Test reference | Notes |
|-------------------------------------------------------------------------------------------------------------------------------|---------------|--------|----------------|-------|
| Editing the power producer generator recreates the building group @ 1 building                                                | BG-I-E-POW-1  | ?      | —              |       |
| Editing the power producer fuel recipe recreates the building group @ 1 building                                              | BG-I-E-POW-2  | ?      | —              |       |
| Editing the power producer buildings count has a debounce                                                                     | BG-I-E-POW-3  | ?      | —              |       |
| Editing the power producer byproduct has a debounce                                                                           | BG-I-E-POW-4  | ?      | —              |       |
| Editing the power producer supplemental fuel has a debounce                                                                   | BG-I-E-POW-5  | ?      | —              |       |
| Editing the power producer power MW production has a debounce                                                                 | BG-I-E-POW-6  | ?      | —              |       |
| SYNC ON: Increasing the power producer fuel quantity increases the building group buildings AND rebalances                    | BG-I-E-POW-7  | ?      | —              |       |
| SYNC ON: Decreasing the power producer fuel quantity decreases the building group buildings AND rebalances                    | BG-I-E-POW-8  | ?      | —              |       |
| SYNC ON: Changing the power producer buildings changes the building group buildings (single group)                            | BG-I-E-POW-9  | ?      | —              |       |
| SYNC ON: Changing the power producer buildings changes AND rebalances the building group buildings (multiple groups)          | BG-I-E-POW-10 | ?      | —              |       |
| SYNC ON: Changing the power producer byproduct quantity changes the building group buildings (single group)                   | BG-I-E-POW-11 | ?      | —              |       |
| SYNC ON: Changing the power producer byproduct quantity changes AND rebalances the building group buildings (multiple groups) | BG-I-E-POW-12 | ?      | —              |       |
| SYNC ON: Changing the power producer supplemental fuel changes the building group buildings (single group)                    | BG-I-E-POW-13 | ?      | —              |       |
| SYNC ON: Changing the power producer supplemental fuel changes AND rebalances the building group buildings (multiple groups)  | BG-I-E-POW-14 | ?      | —              |       |

## Remaining work summary

Broken / not implemented (product decisions made, work outstanding):
1. Byproduct / ingredient edits on the item do not flow to building groups (BG-I-E-PROD-9/10/13/14).
2. Sync-off status colours don't update (BG-I-E-PROD-20).
3. Debounces missing on item buildings / byproducts / ingredients inputs (BG-I-E-PROD-4/5/6).
4. Overclock display precision is 0.001, want 0.0001 (BG-E-B-PROD-16).
5. Group parts model holds ONE amount per part, so recipes where a part is both ingredient AND byproduct (e.g. distilled silica's water) cannot display both sides. Needs a split ingredient/output parts model. See the skipped spot check in `web/src/components/planner/products/BuildingGroups.spec.ts`.

Untested areas needing coverage:
1. Remainder buttons' enablement states via UI (BG-E-AB-PROD-7..12, 14).
2. Group ingredient edits syncing back to the product (BG-E-I-PROD-8/9), recipe change (BG-I-E-PROD-2).
3. All of power producers' group editing + item editing (BG-E-B-POW, BG-I-E-POW).

Not implemented at all:
1. Somersloops (BG-E-S-PROD) — stub only.
