# Building Groups Operations / Test sheet

The amount of user operations and interactions that the building groups add to the planner is overwhelming, and is too much for any one brain to contain.

Therefore, the table below lists all possible operations that the user could perform on the building groups and items, and whether the feature has been properly implemented and has written tests (with references) for it.

## Building Groups Creation / Deletion
Ref: BG-C-D

| Operation                                                                             | Ref | Implemented | Unit Tested | Eyeballed |
|---------------------------------------------------------------------------------------|-----|-------------|-------------|-----------|
| Create a new building group                                                           |     |             |             |           |
| Create a new building group with preexisting disables item sync                       |     |             |             |           |
| Create multiple building groups, with 0 building default                              |     |             |             |           |
| Prevent deletion of a building group when last remaining                              |     |             |             |           | 
| Enable Evenly Balance button when multiple building groups                            |     |             |             |           |
| Enable Remainder to Last button when multiple building groups                         |     |             |             |           |
| Enable Remainder to New Group button when multiple building groups                    |     |             |             |           | 
| Deletion of a building group with multiple groups                                     |     |             |             |           |
| Deletion of the product removes the building groups                                   |     |             |             |           |
| Deletion of the product removes the part difference from the factory                  |     |             |             |           | 
| Deletion of building groups updates the factory parts                                 |     |             |             |           |
| Deletion of building groups to 1 remaining re-enables sync                            |     |             |             |           |  
| Deletion of building groups to 1 remaining disables the delete group button           |     |             |             |           |
| Deletion of building groups to 1 remaining disables the evenly balance button         |     |             |             |           |
| Deletion of building groups to 1 remaining disables the remainder to new group button |     |             |             |           |

## Building Groups Editing - Buildings (Products)
Ref: BG-E-B-PROD

| Operation                                                                                           | Ref | Implemented | Unit Tested | Eyeballed |
|-----------------------------------------------------------------------------------------------------|-----|-------------|-------------|-----------|
| Edit the building count of the building group                                                       |     |             |             |           |     
| Edit the building count, updates the effective buildings                                            |     |             |             |           |
| Edit the building count, updates the remaining buildings                                            |     |             |             |           | 
| Edit the building count, updates the parts                                                          |     |             |             |           |
| Edit the building count, updates the power used                                                     |     |             |             |           | 
| Edit the building count, updates the factory parts produced                                         |     |             |             |           |
| Edit the building count, updates the factory parts consumed                                         |     |             |             |           |
| Edit the building count, updates the factory power used                                             |     |             |             |           | 
| Edit the building count, updates the factory total buildings                                        |     |             |             |           |
| Edit the building count, does NOT rebalance the building group                                      |     |             |             |           |
| Edit the building count, does NOT adjust overclocks                                                 |     |             |             |           | 
| Edit the building count, building count is NOT rounded, and exactly matches what the user entered   |     |             |             |           |
| Sync ON: Edit the building count, updates the product's total buildings (whole numbers)             |     |             |             |           |
| Sync ON: Edit the building count AND overclock, updates the product's total buildings (fractionals) |     |             |             |           
| Sync ON: Edit the building count, effective buildings equally match the item's total buildings      |     |             |             |
| Sync ON: Edit the building count, remaining buildings always should be 0                            |     |             |             |
| Sync ON: Edit the building count, colours for remaining status should be green                      |     |             |             |
| Sync OFF: Edit the building count, does NOT affect the item's total buildings                       |     |             |             |
| Sync OFF: Edit the building count, does affect the factory parts produced                           |     |             |             |
| Sync OFF: Edit the building count, effective buildings correctly detecting BG -> Item mismatch      |     |             |             |
| Sync OFF: Edit the building count, remaining buildings correctly updated                            |     |             |             |
| Sync OFF: Edit the building count, colours for remaining status should be red if mismatched         |     |             |             |
| When building counts are under balanced, "Under Producing!" is shown                                |     |             |             |
| When building counts are over balanced, "Over Producing!" is shown                                  |     |             |             |
| When building counts are balanced, "Looking good, Pioneer!" is shown                                |     |             |             |
| Disable Remainder to last when buildings are balanced                                               |     |             |             |
| Disable Remainder to new group when buildings are balanced                                          |     |             |             |

## Building Groups Editing - Clocks (Products)
Ref: BG-E-C-PROD

| Operation                                                                               | Ref | Implemented | Tested |
|-----------------------------------------------------------------------------------------|-----|-------------|--------|
| Editing the clock has a debounce                                                        |     |             |        |
| Edit group clock of the building group (1 building)                                     |     |             |        |
| Edit group clock, updates the effective buildings                                       |     |             |        |
| Edit group clock, updates the remaining buildings                                       |     |             |        |
| Edit group clock, updates the group's power consumption underchip                       |     |             |        |
| Edit group clock, updates the factory's power consumption                               |     |             |        |
| Edit group clock, updates the group's parts                                             |     |             |        |
| Edit group clock, clock is NOT rounded, and exactly matches what the user entered       |     |             |        |
| Edit group clock, effective buildings properly reflect the new clock                    |     |             |        |
| Edit group clock, "is correct" colouring properly reflects balance / imbalance          |     |             |        |
| Edit group clock, building count does NOT increase when >100% clock                     |     |             |        |
| Edit group clock, building count does NOT decrease when <100% clock                     |     |             |        |
| Sync ON: Edit group clock, updates the product's total buildings (fractionals)          |     |             |        |
| Sync ON: Edit group clock, effective buildings equally match the item's total buildings |     |             |        |

## Building Groups Editing - Sommersloops (Products)
Ref: BG-E-S-PROD

NOT IMPLEMENTED

## Building Groups Editing - Ingredients (Products)
Ref: BG-E-I-PROD

| Operation                                                                                                                    | Ref | Implemented | Tested |
|------------------------------------------------------------------------------------------------------------------------------|-----|-------------|--------|
| Editing an ingredient has a debounce                                                                                         |     |             |        |
| Edit the ingredient of a building group updates the building count AND clocks                                                |     |             |        |
| Edit the ingredient of a building group updates the effective buildings                                                      |     |             |        |
| Edit the ingredient of a building group updates the remaining buildings                                                      |     |             |        |
| Edit the ingredient of a building group updates the parts with the exact input the user entered (no major rounding deviance) |     |             |        |
| Edit the ingredient of a building group updates the power used                                                               |     |             |        |

## Building Groups Editing - Buildings (Power Producers)
Ref: BG-E-B-POW

| Operation                                     | Ref         | Implemented | Unit Tested? | Eyeballed |
|-----------------------------------------------|-------------| ----------- |--------------|-----------|
| Edit the building count of the building group | BGE-B-POW-1 |  |              |           |   |           |       |

## Item Editing - Products
Ref: BG-I-E-PROD

| Operation                                                                                                          | Ref | Implemented | Tested |
|--------------------------------------------------------------------------------------------------------------------|-----|-------------|--------|
| Editing the product's item recreates the building group @ 1 building                                               |     |             |        |
| Editing the product's recipe recreates the building group @ 1 building                                             |     |             |        |
| Editing the product's buildings has a debounce                                                                     |     |             |        |
| Editing the product's byproducts has a debounce                                                                    |     |             |        |
| Editing the product's ingredients has a debounce                                                                   |     |             |        |
| SYNC ON: Increasing the product quantity increases the building group's buildings AND rebalances                   |     |             |        |
| SYNC ON: Decreasing the product quantity decreases the building group's buildings AND rebalances                   |     |             |        |
| SYNC ON: Changing the product's buildings changes the building group's buildings (single group)                    |     |             |        |
| SYNC ON: Changing the product's buildings changes AND rebalances the building group's buildings (multiple groups)  |     |             |        |
| SYNC ON: Changing the product's byproducts changes the building group's buildings (single group)                   |     |             |        |
| SYNC ON: Changing the product's byproducts changes AND rebalances the building group's buildings (multiple groups) |     |             |        |
| SYNC ON: Changing the product's Ingredient changes the building group's buildings (single group)                   |     |             |        |
| SYNC ON: Changing the product's Ingredient changes AND rebalances the building group's buildings (multiple groups) |     |             |        |

## Item Editing - Power Producers
Ref: BG-I-E-POW

| Operation                                                                                                                         | Ref | Implemented | Tested |
|-----------------------------------------------------------------------------------------------------------------------------------|-----|-------------|--------|
| Editing the power producer's generator recreates the building group @ 1 building                                                  |     |             |        |
| Editing the power producer's fuel recipe recreates the building group @ 1 building                                                |     |             |        |
| Editing the power producer's buildings count has a debounce                                                                       |     |             |        |
| Editing the power producer's byproduct has a debounce                                                                             |     |             |        |
| Editing the power producer's supplemental fuel has a debounce                                                                     |     |             |        |
| Editing the power producer's power MW production has a debounce                                                                   |     |             |        |
| SYNC ON: Increasing the power producer's fuel quantity increases the building group's buildings AND rebalances                    |     |             |        |
| SYNC ON: Decreasing the power producer's fuel quantity decreases the building group's buildings AND rebalances                    |     |             |        |
| SYNC ON: Changing the power producer's buildings changes the building group's buildings (single group)                            |     |             |        |
| SYNC ON: Changing the power producer's buildings changes AND rebalances the building group's buildings (multiple groups)          |     |             |        |
| SYNC ON: Changing the power producer's byproduct quantity changes the building group's buildings (single group)                   |     |             |        |
| SYNC ON: Changing the power producer's byproduct quantity changes AND rebalances the building group's buildings (multiple groups) |     |             |        |
| SYNC ON: Changing the power producer's supplmental fuel changes the building group's buildings (single group)                     |     |             |        |
| SYNC ON: Changing the power producer's supplmental fuel changes AND rebalances the building group's buildings (multiple groups)   |     |             |        |
