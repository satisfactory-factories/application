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

| Operation                                                                     | Ref | Implemented | Unit Tested? | Eyeballed | Notes                                                             |
|-------------------------------------------------------------------------------|-----|-------------|--------------|-----------|-------------------------------------------------------------------|
| Create a new building group                                                   |     | Y           |              | Y         |
| Create a new building group with preexisting groups disables item sync        |     | Y           |              | Y         |
| Create multiple building groups, with 0 building default                      |     | Y           |              | Y         |
| Prevent deletion of a building group when last remaining                      |     | Y           |              | Y         |
| Deletion of a building group with multiple groups                             |     | Y           |              | Y         |
| Deletion of the product removes the building groups                           |     | Y           |              | Y         |
| Deletion of the product removes the part difference from the factory          |     | Y           |              | Y         | A bit wonky right now as part calculations are delayed, but works |
| Deletion of building groups updates the factory parts                         |     |             |              | ?         |
| Deletion of building groups to 1 remaining disables the delete group button   |     |             |              | Y         |
| Deletion of building groups to 1 remaining disables the evenly balance button |     | Y           |              | Y         |
| Deletion of building groups should disable sync                               |     |             |              | B         |

## Building Groups Editing - Action Buttons (Products)
Ref: BG-E-AB-PROD

| Operation                                                                                       | Ref | Implemented | Unit Tested? | Eyeballed | Notes                                                     |
|-------------------------------------------------------------------------------------------------|-----|-------------|--------------|-----------|-----------------------------------------------------------|
| Disable Evenly Balance button for singular building group                                       |     |             |              | Y         |
| Enable Evenly Balance button when multiple building groups WITHOUT need of remainder            |     |             |              | B         | Is disabled when balanced                                 |
| Disable Evenly Balance button if all building groups have the same building counts and clocks   |     |             |              | B         | Does not check the count and clock                        |
| When effective is under balanced, "Under Producing!" is shown                                   |     |             |              | Y         |
| When effective is over balanced, "Over Producing!" is shown                                     |     |             |              | Y         |
| When effective is balanced, "Looking good, Pioneer!" is shown                                   |     |             |              | Y         |
| When effective is balanced, Evenly Balance button should still be enabled                       |     |             |              | B         | Is disabled when balanced                                 |
| When effective is balanced, disable Remainder to Last button                                    |     |             |              | Y         |
| When effective is balanced, disable Remainder to New Group button                               |     |             |              | Y         |
| When effective is imbalanced, enable Remainder to Last button for multiple building groups      |     |             |              | ?         | Can't properly test due to forced rebalance bug           |
| When effective is imbalanced, enable Remainder to New Group button for singular building group  |     |             |              | ?         | Can't properly test due to forced rebalance bug           |
| When effective is imbalanced, enable Remainder to New Group button for multiple building groups |     |             |              | ?         | Can't properly test due to forced rebalance bug           |
| When any group has clock of !== 100%, show OC @ 100% button                                     |     |             |              | Y         | Works but may only be working due to forced rebalance     | 
| Pressing "Remainder to new group" creates a new group with the remainder                        |     |             |              | P         | Works but not convinced fully due to forced rebalance bug |

## Building Groups Editing - Buildings (Products)
Ref: BG-E-B-PROD

| Operation                                                                               | Ref | Implemented | Unit Tested? | Eyeballed | Notes                                                     |
|-----------------------------------------------------------------------------------------|-----|-------------|--------------|-----------|-----------------------------------------------------------|
| Allows editing the building count                                                       |     |             |              | Y         |
| Updates the effective buildings                                                         |     |             |              | Y         |
| Updates the remaining buildings                                                         |     |             |              | Y         |
| Updates the group parts                                                                 |     |             |              | B         | Underchips are updated, but not the parts themselves      |
| Updates the parts of the product                                                        |     |             |              | P         | Product parts are updated, but lag behind by 1 change     |
| Updates the power used                                                                  |     |             |              | B         | Absolutely no changes to any power metrics group or fac   |
| Updates the factory parts produced                                                      |     |             |              | P         | Like products, lags behind by 1 change                    |
| Updates the factory parts consumed                                                      |     |             |              | P         | Ditto                                                     |
| Updates the factory power used                                                          |     |             |              | B         | No changes                                                | 
| Updates the factory total buildings                                                     |     |             |              | Y         | 
| Using multiple groups, does NOT rebalance the building groups                           |     |             |              | B         | A rebalance is forced, messes everything up               |
| Using multiple groups, does NOT adjust overclocks                                       |     |             |              | B         | Ditto                                                     |
| Building count is NOT rounded, and exactly matches what the user entered                |     |             |              | Y         | User prevented from entering decimals                     | 
| Sync ON: Updates the product's total buildings (whole numbers)                          |     |             |              | Y         |
| Sync ON: Updating clount with clock, updates the product's total buildings into decimal |     |             |              | Y         |
| Sync ON: Effective buildings equally match the item's total buildings                   |     |             |              | Y         |
| Sync ON: Remaining buildings always should be 0                                         |     |             |              | Y         |
| Sync ON: Colours for remaining status should be green                                   |     |             |              | Y         |
| Sync OFF: Does NOT affect the item's total buildings                                    |     |             |              | Y         |
| Sync OFF: Enables asymmetrical building groups (not forced balanced)                    |     |             |              | B         | Being forced balanced                                     |
| Sync OFF: Does affect the factory parts produced                                        |     |             |              | ?         | Unknown due to the fact part updates are generally broken | 
| Sync OFF: Effective buildings correctly detecting BG -> Item mismatch                   |     |             |              | Y         |
| Sync OFF: Remaining buildings correctly updated                                         |     |             |              | Y         |
| Sync OFF: Colours for remaining status be correct (red = imbalance, green = balanced)   |     |             |              | Y         |

## Building Groups Editing - Clocks (Products)
Ref: BG-E-C-PROD

| Operation                                                               | Ref | Implemented | Unit Tested? | Eyeballed | Notes                                       |
|-------------------------------------------------------------------------|-----|-------------|--------------|-----------|---------------------------------------------|
| Editing the clock has a debounce                                        |     |             |              | Y         |
| Allows editing                                                          |     |             |              | Y         |
| Updates the effective buildings                                         |     |             |              | Y         |
| Updates the remaining buildings                                         |     |             |              | Y         |
| Updates the group's power consumption underchip                         |     |             |              | B         | Doesn't update power at all at all it seems |
| Updates the factory's power consumption                                 |     |             |              | B         |
| Updates the group's parts                                               |     |             |              | B         | No updates whatsoever                       | 
| Clock is NOT rounded, and exactly matches what the user entered         |     |             |              | Y         |
| "Is correct" colouring properly reflects balance / imbalance            |     |             |              | Y         |
| Building group building count does NOT change                           |     |             |              | Y         |
| Sync ON: Updates the product's total buildings (fractionals)            |     |             |              | Y         |
| Sync OFF: DOES NOT update the product's total buildings                 |     |             |              | Y         |
| Sync ON: Effective buildings equally match the item's total buildings   |     |             |              | Y         |
| Sync OFF: Effective buildings DOES NOT match the item's total buildings |     |             |              | Y         |
| Sync OFF: Upon imbalance, remaining buildings should be showing in red  |     |             |              | Y         |

## Building Groups Editing - Sommersloops (Products)
Ref: BG-E-S-PROD

NOT IMPLEMENTED

## Building Groups Editing - Ingredients (Products)
Ref: BG-E-I-PROD

| Operation                                   | Ref | Implemented | Unit Tested? | Eyeballed | Notes                                                         |
|---------------------------------------------|-----|-------------|--------------|-----------|---------------------------------------------------------------|
| Debounce is present                         |     |             |              | Y         |
| Building count AND clocks updated           |     |             |              | Y         |
| Effective buildings updated                 |     |             |              |           |
| Remaining buildings updated                 |     |             |              |           |
| Parts with the exact input the user entered |     |             |              | B         | Clock rounded to whole numbers resulting in decimals in parts |
| Group Power used updated                    |     |             |              | Y         |
| Factory Power used updated                  |     |             |              | Y         |
| SYNC ON: Building count updated on Product  |     |             |              | B         |
| SYNC ON: Ingredients updated on Product     |     |             |              | B         |

## Building Groups Editing - Buildings (Power Producers)
Ref: BG-E-B-POW

| Operation                                    | Ref         | Implemented | Unit Tested? | Eyeballed |
|----------------------------------------------|-------------|-------------|--------------|-----------|
| Allows editing the building count            |             |             |              |           |
TO ADD MORE

## Item Editing - Products
Ref: BG-I-E-PROD

| Operation                                                                                                | Ref | Implemented | Unit Tested? | Eyeballed | Notes                                                          |
|----------------------------------------------------------------------------------------------------------|-----|-------------|--------------|-----------|----------------------------------------------------------------|
| Editing the product's item recreates the building group @ 1 building                                     |     |             |              | Y         |
| Editing the product's recipe recreates the building group @ 1 building                                   |     |             |              | P/B       | Updates the group but not the item's buildings                 |
| Editing the product's quantity has a debounce                                                            |     |             |              | B         |
| Editing the product's buildings has a debounce                                                           |     |             |              | B         |
| Editing the product's byproducts has a debounce                                                          |     |             |              | B         |
| Editing the product's ingredients has a debounce                                                         |     |             |              | B         |
| SYNC ON: Singular group: Changing the product quantity updates the building group's building count       |     |             |              | B         | Does not change the group at all                               |
| SYNC ON: Multiple groups: Changing the product quantity triggers a rebalance                             |     |             |              | B         | Does not change the groups at all                              |
| SYNC ON: Single group: Changing the product's Building count changes the building group's building count |     |             |              | B         | Does not accept input from the user                            |
| SYNC ON: Multiple: Changing the product's Building count triggers a rebalance                            |     |             |              | Y/?       | Likely only working due to the rebalance bug, needs checking   |
| SYNC ON: Single group: Changing the product's byproducts changes the building group's building count     |     |             |              | B         | Does not change the group at all                               |
| SYNC ON: Multiple: Changing the product's byproducts triggers a rebalance                                |     |             |              | B         | Does not change the groups at all                              |
| SYNC ON: Single group: Changing the product's Ingredient changes the building group's building count     |     |             |              |           | Does not change the group at all                               |
| SYNC ON: Multiple groups: Changing the product's Ingredient triggers a rebalance                         |     |             |              |           | Does not change the groups at all                              |
| SYNC OFF: Changing the product quantity does NOT trigger a rebalance or makes any edits                  |     |             |              | Y         | 
| SYNC OFF: Changing the product byproducts does NOT trigger a rebalance or makes any edits                |     |             |              | Y         |
| SYNC OFF: Changing the product's Ingredient DOES NOT trigger a rebalance or makes any edits              |     |             |              | Y         | Is also updating remaining                                     |
| SYNC OFF: Making changes to the product updates the effective buildings readout                          |     |             |              | Y         |
| SYNC OFF: Making changes to the product updates the remaining buildings readout                          |     |             |              | Y         |
| SYNC OFF: Making changes to the product updates the status colors                                        |     |             |              | B         | The colours are not updating with new effective building state |

## Item Editing - Power Producers
Ref: BG-I-E-POW

| Operation                                                                                                                         | Ref | Implemented | Unit Tested? | Eyeballed |
|-----------------------------------------------------------------------------------------------------------------------------------|-----|-------------|--------------|-----------|
| Editing the power producer's generator recreates the building group @ 1 building                                                  |     |             |              |           |
| Editing the power producer's fuel recipe recreates the building group @ 1 building                                                |     |             |              |           |
| Editing the power producer's buildings count has a debounce                                                                       |     |             |              |           |
| Editing the power producer's byproduct has a debounce                                                                             |     |             |              |           |
| Editing the power producer's supplemental fuel has a debounce                                                                     |     |             |              |           |
| Editing the power producer's power MW production has a debounce                                                                   |     |             |              |           |
| SYNC ON: Increasing the power producer's fuel quantity increases the building group's buildings AND rebalances                    |     |             |              |           |
| SYNC ON: Decreasing the power producer's fuel quantity decreases the building group's buildings AND rebalances                    |     |             |              |           |
| SYNC ON: Changing the power producer's buildings changes the building group's buildings (single group)                            |     |             |              |           |
| SYNC ON: Changing the power producer's buildings changes AND rebalances the building group's buildings (multiple groups)          |     |             |              |           |
| SYNC ON: Changing the power producer's byproduct quantity changes the building group's buildings (single group)                   |     |             |              |           |
| SYNC ON: Changing the power producer's byproduct quantity changes AND rebalances the building group's buildings (multiple groups) |     |             |              |           |
| SYNC ON: Changing the power producer's supplmental fuel changes the building group's buildings (single group)                     |     |             |              |           |
| SYNC ON: Changing the power producer's supplmental fuel changes AND rebalances the building group's buildings (multiple groups)   |     |             |              |           |
