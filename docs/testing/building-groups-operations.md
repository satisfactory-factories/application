# Building Groups Operations / Test sheet

The amount of user operations and interactions that the building groups add to the planner is overwhelming, and is too much for any one brain to contain.

Therefore, the table below lists all possible operations that the user could perform on the building groups and items, and whether the feature has been properly implemented and has written tests (with references) for it.

Key:
- Y = Yes, implemented, works
- B = Confirmed broken
- P = Partially implemented
- ? = Unknown, unable to test / requires retest 

## Building Groups Creation / Deletion
Ref: BG-C-D

| Operation                                                                     | Ref       | Implemented | Unit Tested? | Eyeballed | Notes                                                             |
|-------------------------------------------------------------------------------|-----------|-------------|--------------|-----------|-------------------------------------------------------------------|
| Create a new building group upon product addition                             | BG-C-D-1  | Y           | Y            | Y         |
| Create a second building group                                                | BG-C-D-2  | Y           | Y            | Y         |
| Upon creating new product, creates a BG count with the expected building size | BG-C-D-3  | Y           | Y            | Y         |
| Creating a new building group with preexisting groups disables item sync      | BG-C-D-4  | Y           | Y            | Y         |
| Create multiple building groups, with 0 building default count                | BG-C-D-5  | Y           | Y            | Y         |
| Prevent deletion of a building group when last remaining                      | BG-C-D-6  | Y           | Y            | Y         |
| Deletion of a building group with multiple groups                             | BG-C-D-7  | Y           | Y            | Y         |
| Deletion of the product removes the building groups                           | BG-C-D-8  | Y           | Y            | Y         |
| Deletion of building groups updates the factory parts                         | BG-C-D-9  |             |              | ?         |
| Deletion of building groups to 1 remaining disables the delete group button   | BG-C-D-10 |             |              | Y         |
| Deletion of building groups to 1 remaining disables the evenly balance button | BG-C-D-11 | Y           |              | Y         |
| Deletion of building groups should disable sync                               | BG-C-D-12 |             |              | B         |

## Building Groups Editing - Action Buttons (Products)
Ref: BG-E-AB-PROD

| Operation                                                                                       | Ref             | Implemented | Unit Tested? | Eyeballed | Notes                                                     |
|-------------------------------------------------------------------------------------------------|-----------------|-------------|--------------|-----------|-----------------------------------------------------------|
| Disable Evenly Balance button for singular building group                                       | BG-E-AB-PROD-1  |             |              | Y         |
| Enable Evenly Balance button when multiple building groups WITHOUT need of remainder            | BG-E-AB-PROD-2  |             |              | B         | Is disabled when balanced                                 |
| Disable Evenly Balance button if all building groups have the same building counts and clocks   | BG-E-AB-PROD-3  |             |              | B         | Does not check the count and clock                        |
| When effective is under balanced, "Under Producing!" is shown                                   | BG-E-AB-PROD-4  |             |              | Y         |
| When effective is over balanced, "Over Producing!" is shown                                     | BG-E-AB-PROD-5  |             |              | Y         |
| When effective is balanced, "Looking good, Pioneer!" is shown                                   | BG-E-AB-PROD-6  |             |              | Y         |
| When effective is balanced, Evenly Balance button should still be enabled                       | BG-E-AB-PROD-7  |             |              | B         | Is disabled when balanced                                 |
| When effective is balanced, disable Remainder to Last button                                    | BG-E-AB-PROD-8  |             |              | Y         |
| When effective is balanced, disable Remainder to New Group button                               | BG-E-AB-PROD-9  |             |              | Y         |
| When effective is imbalanced, enable Remainder to Last button for multiple building groups      | BG-E-AB-PROD-10 |             |              | ?         | Can't properly test due to forced rebalance bug           |
| When effective is imbalanced, enable Remainder to New Group button for singular building group  | BG-E-AB-PROD-11 |             |              | ?         | Can't properly test due to forced rebalance bug           |
| When effective is imbalanced, enable Remainder to New Group button for multiple building groups | BG-E-AB-PROD-12 |             |              | ?         | Can't properly test due to forced rebalance bug           |
| When any group has clock of !== 100%, show OC @ 100% button                                     | BG-E-AB-PROD-13 |             |              | Y         | Works but may only be working due to forced rebalance     |
| Pressing "Remainder to new group" creates a new group with the remainder                        | BG-E-AB-PROD-14 |             |              | P         | Works but not convinced fully due to forced rebalance bug |
| Sync is shown as enabled upon creating a new product                                            | BG-E-AB-PROD-15 | Y           | Y            | Y         |
| Pressing "Sync" disables sync for the item when enabled                                         | BG-E-AB-PROD-16 | Y           | Y            | Y         |
| Pressing "Sync" enables sync for the item when disabled                                         | BG-E-AB-PROD-17 | Y           | Y            | Y         |

## Building Groups Editing - Buildings (Products)
Ref: BG-E-B-PROD

| Operation                                                                               | Ref             | Implemented | Unit Tested? | Eyeballed | Notes                                                     |
|-----------------------------------------------------------------------------------------|-----------------|-------------|--------------|-----------|-----------------------------------------------------------|
| Allows editing the building count                                                       | BG-E-B-PROD-1   |             |              | Y         |
| Updates the effective buildings                                                         | BG-E-B-PROD-2   |             |              | Y         |
| Updates the remaining buildings                                                         | BG-E-B-PROD-3   |             |              | Y         |
| Updates the group parts                                                                 | BG-E-B-PROD-4   |             |              | B         | Underchips are updated, but not the parts themselves      |
| Updates the parts of the product                                                        | BG-E-B-PROD-5   |             |              | P         | Product parts are updated, but lag behind by 1 change     |
| Updates the power used                                                                  | BG-E-B-PROD-6   |             |              | B         | Absolutely no changes to any power metrics group or fac   |
| Updates the factory parts produced                                                      | BG-E-B-PROD-7   |             |              | P         | Like products, lags behind by 1 change                    |
| Updates the factory parts consumed                                                      | BG-E-B-PROD-8   |             |              | P         | Ditto                                                     |
| Updates the factory power used                                                          | BG-E-B-PROD-9   |             |              | B         | No changes                                                |
| Updates the factory total buildings                                                     | BG-E-B-PROD-10  |             |              | Y         |
| Using multiple groups, does NOT rebalance the building groups                           | BG-E-B-PROD-11  |             |              | B         | A rebalance is forced, messes everything up               |
| Using multiple groups, does NOT adjust overclocks                                       | BG-E-B-PROD-12  |             |              | B         | Ditto                                                     |
| Building count is NOT rounded, and exactly matches what the user entered                | BG-E-B-PROD-13  |             |              | Y         | User prevented from entering decimals                     |
| Sync ON: Updates the product's total buildings (whole numbers)                          | BG-E-B-PROD-14  |             |              | Y         |
| Sync ON: Updating clount with clock, updates the product's total buildings into decimal | BG-E-B-PROD-15  |             |              | Y         |
| Sync ON: Effective buildings equally match the item's total buildings                   | BG-E-B-PROD-16  |             |              | Y         |
| Sync ON: Remaining buildings always should be 0                                         | BG-E-B-PROD-17  |             |              | Y         |
| Sync ON: Colours for remaining status should be green                                   | BG-E-B-PROD-18  |             |              | Y         |
| Sync OFF: Does NOT affect the item's total buildings                                    | BG-E-B-PROD-19  |             |              | Y         |
| Sync OFF: Enables asymmetrical building groups (not forced balanced)                    | BG-E-B-PROD-20  |             |              | B         | Being forced balanced                                     |
| Sync OFF: Does affect the factory parts produced                                        | BG-E-B-PROD-21  |             |              | ?         | Unknown due to the fact part updates are generally broken |
| Sync OFF: Effective buildings correctly detecting BG -> Item mismatch                   | BG-E-B-PROD-22  |             |              | Y         |
| Sync OFF: Remaining buildings correctly updated                                         | BG-E-B-PROD-23  |             |              | Y         |
| Sync OFF: Colours for remaining status be correct (red = imbalance, green = balanced)   | BG-E-B-PROD-24  |             |              | Y         |

## Building Groups Editing - Clocks (Products)
Ref: BG-E-C-PROD

| Operation                                                               | Ref             | Implemented | Unit Tested? | Eyeballed | Notes                                       |
|-------------------------------------------------------------------------|-----------------|-------------|--------------|-----------|---------------------------------------------|
| Editing the clock has a debounce                                        | BG-E-C-PROD-1   |             |              | Y         |
| Allows editing                                                          | BG-E-C-PROD-2   |             |              | Y         |
| Updates the effective buildings                                         | BG-E-C-PROD-3   |             |              | Y         |
| Updates the remaining buildings                                         | BG-E-C-PROD-4   |             |              | Y         |
| Updates the group's power consumption underchip                         | BG-E-C-PROD-5   |             |              | B         | Doesn't update power at all at all it seems |
| Updates the factory's power consumption                                 | BG-E-C-PROD-6   |             |              | B         |
| Updates the group's parts                                               | BG-E-C-PROD-7   |             |              | B         | No updates whatsoever                       |
| Clock is NOT rounded, and exactly matches what the user entered         | BG-E-C-PROD-8   |             |              | Y         |
| "Is correct" colouring properly reflects balance / imbalance            | BG-E-C-PROD-9   |             |              | Y         |
| Building group building count does NOT change                           | BG-E-C-PROD-10  |             |              | Y         |
| Sync ON: Updates the product's total buildings (fractionals)            | BG-E-C-PROD-11  |             |              | Y         |
| Sync OFF: DOES NOT update the product's total buildings                 | BG-E-C-PROD-12  |             |              | Y         |
| Sync ON: Effective buildings equally match the item's total buildings   | BG-E-C-PROD-13  |             |              | Y         |
| Sync OFF: Effective buildings DOES NOT match the item's total buildings | BG-E-C-PROD-14  |             |              | Y         |
| Sync OFF: Upon imbalance, remaining buildings should be showing in red  | BG-E-C-PROD-15  |             |              | Y         |

## Building Groups Editing - Sommersloops (Products)
Ref: BG-E-S-PROD

NOT IMPLEMENTED

## Building Groups Editing - Ingredients (Products)
Ref: BG-E-I-PROD

| Operation                                   | Ref             | Implemented | Unit Tested? | Eyeballed | Notes                                                         |
|---------------------------------------------|-----------------|-------------|--------------|-----------|---------------------------------------------------------------|
| Debounce is present                         | BG-E-I-PROD-1   |             |              | Y         |
| Building count AND clocks updated           | BG-E-I-PROD-2   |             |              | Y         |
| Effective buildings updated                 | BG-E-I-PROD-3   |             |              |           |
| Remaining buildings updated                 | BG-E-I-PROD-4   |             |              |           |
| Parts with the exact input the user entered | BG-E-I-PROD-5   |             |              | B         | Clock rounded to whole numbers resulting in decimals in parts |
| Group Power used updated                    | BG-E-I-PROD-6   |             |              | Y         |
| Factory Power used updated                  | BG-E-I-PROD-7   |             |              | Y         |
| SYNC ON: Building count updated on Product  | BG-E-I-PROD-8   |             |              | B         |
| SYNC ON: Ingredients updated on Product     | BG-E-I-PROD-9   |             |              | B         |

## Building Groups Editing - Buildings (Power Producers)
Ref: BG-E-B-POW

| Operation                                    | Ref         | Implemented | Unit Tested? | Eyeballed |
|----------------------------------------------|-------------|-------------|--------------|-----------|
| Allows editing the building count            |             |             |              |           |
TO ADD MORE

## Item Editing - Products
Ref: BG-I-E-PROD

| Operation                                                                                                | Ref             | Implemented | Unit Tested? | Eyeballed | Notes                                                          |
|----------------------------------------------------------------------------------------------------------|-----------------|-------------|--------------|-----------|----------------------------------------------------------------|
| Editing the product's item recreates the building group @ 1 building                                     | BG-I-E-PROD-1   |             |              | Y         |
| Editing the product's recipe recreates the building group @ 1 building                                   | BG-I-E-PROD-2   |             |              | P/B       | Updates the group but not the item's buildings                 |
| Editing the product's quantity has a debounce                                                            | BG-I-E-PROD-3   |             |              | B         |
| Editing the product's buildings has a debounce                                                           | BG-I-E-PROD-4   |             |              | B         |
| Editing the product's byproducts has a debounce                                                          | BG-I-E-PROD-5   |             |              | B         |
| Editing the product's ingredients has a debounce                                                         | BG-I-E-PROD-6   |             |              | B         |
| SYNC ON: Singular group: Changing the product quantity updates the building group's building count       | BG-I-E-PROD-7   |             |              | B         | Does not change the group at all                               |
| SYNC ON: Multiple groups: Changing the product quantity triggers a rebalance                             | BG-I-E-PROD-8   |             |              | B         | Does not change the groups at all                              |
| SYNC ON: Single group: Changing the product's Building count changes the building group's building count | BG-I-E-PROD-9   |             |              | B         | Does not accept input from the user                            |
| SYNC ON: Multiple: Changing the product's Building count triggers a rebalance                            | BG-I-E-PROD-10  |             |              | Y/?       | Likely only working due to the rebalance bug, needs checking   |
| SYNC ON: Single group: Changing the product's byproducts changes the building group's building count     | BG-I-E-PROD-11  |             |              | B         | Does not change the group at all                               |
| SYNC ON: Multiple: Changing the product's byproducts triggers a rebalance                                | BG-I-E-PROD-12  |             |              | B         | Does not change the groups at all                              |
| SYNC ON: Single group: Changing the product's Ingredient changes the building group's building count     | BG-I-E-PROD-13  |             |              |           | Does not change the group at all                               |
| SYNC ON: Multiple groups: Changing the product's Ingredient triggers a rebalance                         | BG-I-E-PROD-14  |             |              |           | Does not change the groups at all                              |
| SYNC OFF: Changing the product quantity does NOT trigger a rebalance or makes any edits                  | BG-I-E-PROD-15  |             |              | Y         |
| SYNC OFF: Changing the product byproducts does NOT trigger a rebalance or makes any edits                | BG-I-E-PROD-16  |             |              | Y         |
| SYNC OFF: Changing the product's Ingredient DOES NOT trigger a rebalance or makes any edits              | BG-I-E-PROD-17  |             |              | Y         | Is also updating remaining                                     |
| SYNC OFF: Making changes to the product updates the effective buildings readout                          | BG-I-E-PROD-18  |             |              | Y         |
| SYNC OFF: Making changes to the product updates the remaining buildings readout                          | BG-I-E-PROD-19  |             |              | Y         |
| SYNC OFF: Making changes to the product updates the status colors                                        | BG-I-E-PROD-20  |             |              | B         | The colours are not updating with new effective building state |

## Item Editing - Power Producers
Ref: BG-I-E-POW

| Operation                                                                                                                         | Ref           | Implemented | Unit Tested? | Eyeballed |
|-----------------------------------------------------------------------------------------------------------------------------------|---------------|-------------|--------------|-----------|
| Editing the power producer's generator recreates the building group @ 1 building                                                  | BG-I-E-POW-1  |             |              |           |
| Editing the power producer's fuel recipe recreates the building group @ 1 building                                                | BG-I-E-POW-2  |             |              |           |
| Editing the power producer's buildings count has a debounce                                                                       | BG-I-E-POW-3  |             |              |           |
| Editing the power producer's byproduct has a debounce                                                                             | BG-I-E-POW-4  |             |              |           |
| Editing the power producer's supplemental fuel has a debounce                                                                     | BG-I-E-POW-5  |             |              |           |
| Editing the power producer's power MW production has a debounce                                                                   | BG-I-E-POW-6  |             |              |           |
| SYNC ON: Increasing the power producer's fuel quantity increases the building group's buildings AND rebalances                    | BG-I-E-POW-7  |             |              |           |
| SYNC ON: Decreasing the power producer's fuel quantity decreases the building group's buildings AND rebalances                    | BG-I-E-POW-8  |             |              |           |
| SYNC ON: Changing the power producer's buildings changes the building group's buildings (single group)                            | BG-I-E-POW-9  |             |              |           |
| SYNC ON: Changing the power producer's buildings changes AND rebalances the building group's buildings (multiple groups)          | BG-I-E-POW-10 |             |              |           |
| SYNC ON: Changing the power producer's byproduct quantity changes the building group's buildings (single group)                   | BG-I-E-POW-11 |             |              |           |
| SYNC ON: Changing the power producer's byproduct quantity changes AND rebalances the building group's buildings (multiple groups) | BG-I-E-POW-12 |             |              |           |
| SYNC ON: Changing the power producer's supplemental fuel changes the building group's buildings (single group)                    | BG-I-E-POW-13 |             |              |           |
| SYNC ON: Changing the power producer's supplemental fuel changes AND rebalances the building group's buildings (multiple groups)  | BG-I-E-POW-14 |             |              |           |
