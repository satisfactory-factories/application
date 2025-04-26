import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer,
  ItemType,
} from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'
import { fetchGameData } from '@/utils/gameDataService'
import { calculateHasProblem } from '@/utils/factory-management/problems'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'
import eventBus from '@/utils/eventBus'
import { getPowerRecipe, getRecipe } from '@/utils/factory-management/common'
import { PowerRecipe, Recipe } from '@/interfaces/Recipes'
import { increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
import { CalculationModes } from '@/utils/factory-management/factory'

const gameData = await fetchGameData()

export const addBuildingGroup = (
  item: FactoryItem | FactoryPowerProducer,
  type: ItemType,
  factory: Factory,
) => {
  // If there is no building groups, grab the building requirements and add a building group.
  // This is done from within each method as there's different ways of accessing the building counts.
  const addBuildings = item.buildingGroups.length === 0

  // We always want sync enabled for the first group.
  item.buildingGroupItemSync = true

  // If we have a second group, we need to disable sync.
  if (item.buildingGroups.length > 0) {
    item.buildingGroupItemSync = false
  }

  if (type === ItemType.Product) {
    addProductBuildingGroup(item as FactoryItem, factory, addBuildings)
  } else if (type === ItemType.Power) {
    addPowerProducerBuildingGroup(item as FactoryPowerProducer, factory, addBuildings)
  } else {
    throw new Error(`addBuildingGroup: Invalid group type: ${type}`)
  }
}

// @See ./product.ts, ./power.ts for usages
export const createBuildingGroup = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType,
  matchBuildings = true
) => {
  let buildingCount = item.buildingGroups.length === 0 ? 1 : 0

  if (matchBuildings) {
    if (groupType === ItemType.Product) {
      buildingCount = (item as FactoryItem).buildingRequirements.amount
    } else if (groupType === ItemType.Power) {
      const subject = item as FactoryPowerProducer
      buildingCount = subject.buildingCount

      // We need to shim in the building count if it's 0 but the amount is set. This is for when we are adding a new producer.
      if (buildingCount === 0 && subject.buildingAmount !== 0) {
        buildingCount = subject.buildingAmount
      }
    }
  }

  item.buildingGroups.push({
    id: Math.floor(Math.random() * 10000),
    type: groupType,
    buildingCount,
    overclockPercent: 100,
    parts: {},
    powerUsage: 0,
    powerProduced: 0,
  })
}

// This takes the building groups and:
// 1. Calculates the total building count
// 2. Applies the overclocking to the building count to process the effective building count
export const calculateEffectiveBuildingCount = (buildingGroups: BuildingGroup[]) => {
  let effectiveBuildingCount = 0
  for (const group of buildingGroups) {
    // Remember it is a percentage so we need to divide by 100
    effectiveBuildingCount += group.buildingCount * group.overclockPercent / 100
  }

  return formatNumberFully(effectiveBuildingCount, 4)
}

export const calculateRemainingBuildingCount = (item: FactoryItem | FactoryPowerProducer, groupType: ItemType) => {
  let subject: FactoryItem | FactoryPowerProducer

  const effectiveBuildings = calculateEffectiveBuildingCount(item.buildingGroups)

  if (groupType === ItemType.Product) {
    subject = item as FactoryItem
    return subject.buildingRequirements.amount - Number(effectiveBuildings)
  } else if (groupType === ItemType.Power) {
    subject = item as FactoryPowerProducer
    return subject.buildingCount - Number(effectiveBuildings)
  } else {
    throw new Error('buildingGroupsCommon: calculateRemainingBuildingCount: Invalid group type!')
  }
}

// Returns the total power usage of all building groups for a product
export const calculateProductBuildingGroupPower = (
  buildingGroups: BuildingGroup[],
  building: string,
) => {
  buildingGroups.forEach(group => {
    // In order to figure this out, we need to:
    // 1. Get the original building's power
    // 2. Times the building's power by the overclock percentage, with the ratio of: powerusage=initialpowerusage×(clockspeed100)1.321928

    // Get the building's details
    const consumptionPerBuilding = gameData.buildings[building]

    if (consumptionPerBuilding === undefined) {
      throw new Error(`productBuildingGroups: calculateProductBuildingGroupPower: Building not found! ${building}`)
    }

    // Now, using the formula above, we calculate the power usage.
    const totalConsumption = consumptionPerBuilding * Math.pow(group.overclockPercent / 100, 1.321928)

    // Now multiply it by number of buildings
    group.powerUsage = formatNumberFully(totalConsumption * group.buildingCount, 4)
  })
}

// Returns the total power usage of all building groups for a product
export const calculatePowerProducerBuildingGroupPower = (
  buildingGroups: BuildingGroup[],
  recipe: string
) => {
  buildingGroups.forEach(group => {
    const powerRecipe = getPowerRecipe(recipe, gameData)

    if (!powerRecipe) {
      throw new Error(`productBuildingGroups: calculatePowerProducerBuildingGroupPower: Power recipe not found! ${recipe}`)
    }

    const productionPerBuilding = powerRecipe.building.power * group.buildingCount

    // Power production for power producers is a bit different, it is a flat 1:1 ratio
    const totalProduction = productionPerBuilding * group.overclockPercent / 100

    group.powerProduced = formatNumberFully(totalProduction, 4)
  })
}

export const getBuildingCount = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType
) => {
  let buildingCount = 0

  if (groupType === ItemType.Product) {
    const product = item as FactoryItem
    buildingCount = product.buildingRequirements.amount
  } else if (groupType === ItemType.Power) {
    const producer = item as FactoryPowerProducer
    buildingCount = producer.buildingCount

    // If the power producer is freshly added, and due to the async way power producers are calculated, we need to shim in the building count.
    if (buildingCount === 0 && producer.buildingAmount !== 0) {
      buildingCount = producer.buildingAmount
      // NOTE we do not change the actual data yet, that is done later in the process.
    }
  } else {
    throw new Error('productBuildingGroups: getBuildingCount: Invalid group type!')
  }

  return buildingCount
}

// Calculates all parts for an item based on the building groups
export const calculateBuildingGroupParts = (
  items: (FactoryItem | FactoryPowerProducer)[],
  type: ItemType,
  factory: Factory,
  exclude?: string
) => {
  // Handle any group part quantity changes.
  // Loop through all the building groups buildings and use that as relative to update each part quantities.
  for (const item of items) {
  // Firstly, check if the item needs any building groups as the user may have changed the product.
    if (item.id === '' || item.recipe === '') {
      item.buildingGroups = []
      continue // Skip this product
    }

    // Sanitize the building groups
    // TODO: Hoist this sanitization to the factory calculation
    if (item.buildingGroups.length === 0) {
      if (type === ItemType.Product) {
        addProductBuildingGroup(item as FactoryItem, factory, true)
      } else if (type === ItemType.Power) {
        addPowerProducerBuildingGroup(item as FactoryPowerProducer, factory, true)
      }
    }

    // Get the total building count
    const totalBuildingCount = getBuildingCount(item, type)

    // Get target amount, and set the item ID
    const parts: { [key: string]: number } = {}

    if (type === ItemType.Product) {
      const subject = item as FactoryItem

      for (
        const [part, partData] of Object.entries(subject.requirements)
      ) {
        parts[part] = partData.amount
      }

      // Also add the product and byproduct
      parts[subject.id] = subject.amount
      if (subject.byProducts && subject.byProducts.length > 0) {
        parts[subject.byProducts[0].id] = subject.byProducts[0].amount
      }
    } else if (type === ItemType.Power) {
      const subject = item as FactoryPowerProducer

      // If ingredients are missing, fill them now
      if (subject.ingredients.length === 0) {
        const recipe = getPowerRecipe(subject.recipe, gameData)
        if (!recipe) {
          throw new Error('productBuildingGroups: calculateBuildingGroupParts: Recipe not found!')
        }
        subject.ingredients = recipe.ingredients
      }

      subject.ingredients.forEach(ingredient => {
        parts[ingredient.part] = ingredient.perMin
      })

      // Also add the byproduct
      if (subject.byproduct) {
        parts[subject.byproduct.part] = subject.byproduct.amount
      }
    }

    // Now we have the parts, we can calculate the parts per building
    for (const group of item.buildingGroups) {
      Object.entries(parts).forEach(([partKey, amount]) => {
        if (partKey === exclude) {
          return // Skip this part so we don't cause an update storm.
        }

        // Calculate the amount of parts per building, based off total building count to get the per building amount
        const partPerBuilding = amount / totalBuildingCount

        // Now multiply the per building amount by the number of buildings in the group to get the true amount.
        group.parts[partKey] = (partPerBuilding * group.buildingCount)
      })

      const overclockMulti = group.overclockPercent / 100

      // Now apply the overclock multiplier for all parts in the group
      for (const part in group.parts) {
        group.parts[part] = formatNumberFully(group.parts[part] * overclockMulti, 3)
      }
    }
  }
}

// Calculates whether the building group passes it's requirements for effective buildings
export const calculateBuildingGroupProblems = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType
) => {
  // Get the effective building count
  const effectiveBuildingCount = calculateEffectiveBuildingCount(item.buildingGroups)

  // If the effective building count is out of whack between -0.1 and 0.1, we mark it as having a problem.
  const buildingCount = getBuildingCount(item, groupType)
  const absDiff = Math.abs(buildingCount - effectiveBuildingCount)

  item.buildingGroupsHaveProblem = absDiff > 0.1
}

// Takes the building groups and rebalances them based on the building count
export const syncBuildingGroups = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType,
  factory: Factory,
  modes: CalculationModes = {}
) => {
  // Ensure the math is right in all cases
  recalculateGroupMetrics(item, groupType, factory)

  // If originating from the item, cause a rebalance.
  if (modes.origin === 'item') {
    let targetBuildings: number

    // If the update was triggered from the building group, we need to use the totalled building count derived from the building groups.
    if (modes.useBuildingGroupBuildings) {
      targetBuildings = calculateEffectiveBuildingCount(item.buildingGroups)
    } else {
      targetBuildings = getBuildingCount(item, groupType)
    }
    const groups = item.buildingGroups

    // Divide the target equally among groups.
    const targetPerGroup = targetBuildings / groups.length
    const remainder = targetBuildings % groups.length
    const hasRemainder = remainder ? 1 : 0

    groups.forEach(group => {
    // Even scenario: each group gets exactly the quotient.
    // Odd scenario: each group gets one more building than the quotient (i.e., ceil).
      group.buildingCount = hasRemainder ? Math.ceil(targetPerGroup) : Math.floor(targetPerGroup)

      // Set overclock percentage.
      // Even: no adjustment needed (100%).
      // Odd: underclock so that effective production is exactly targetPerGroup.
      if (hasRemainder) {
        group.overclockPercent = formatNumberFully((targetPerGroup / group.buildingCount) * 100)
      } else {
        group.overclockPercent = 100
      }
    })

    // Recalculate the group metrics after the rebalance.
    recalculateGroupMetrics(item, groupType, factory)
  }
}

// Brought to you courtesy of ChatGPT o3-mini-high.
// This function attempts to match the target building count via both over-allocating buildings and underclocking the remainder.
export const bestEffortUpdateBuildingCount = (
  item: FactoryItem | FactoryPowerProducer,
  group: BuildingGroup,
  groups: BuildingGroup[],
  type: ItemType,
) => {
  // Compute the effective building count for all groups EXCEPT the target.
  const effectiveExcludingTarget = groups
    .slice(0, -1)
    .reduce((total, group) => {
      const percent = group.overclockPercent ?? 100
      return total + group.buildingCount * (percent / 100)
    }, 0)

  const targetEffective = getBuildingCount(item, type)
  const desiredFraction = targetEffective - effectiveExcludingTarget

  // If no gap, nothing to do.
  if (desiredFraction === 0) return

  // Handle overproduction (gap negative)
  if (desiredFraction < 0) {
    group.buildingCount = 1
    group.overclockPercent = formatNumberFully((1 + desiredFraction) * 100)
    return
  }

  /*
    For a positive gap, instead of defaulting to a single building,
    we consider using multiple buildings if the gap exceeds 1 effective building.
    We try candidate building counts (n) and compute the required overclock per building:

    candidateClock = Math.ceil((desiredFraction / n) * 100)

    We then pick the candidate for which candidateClock is as close as possible to 100.
    (We use Math.ceil so any tiny fractional remainder pushes the clock upward slightly.)

    Also, if candidateClock would exceed 250, that candidate is invalid.
  */
  const maxN = Math.ceil(desiredFraction) + 1 // a reasonable search range
  let bestBuildingCount: number | null = null
  let bestClock: number | null = null
  let bestDiff = Number.POSITIVE_INFINITY

  for (let n = 1; n <= maxN; n++) {
    const rawClock = (desiredFraction / n) * 100
    const candidateClock = Math.ceil(rawClock)
    if (candidateClock > 250) continue // game cap: skip any candidate over 250%
    const diff = Math.abs(candidateClock - 100)
    if (diff < bestDiff) {
      bestDiff = diff
      bestBuildingCount = n
      bestClock = candidateClock
    }
  }

  // Fallback if no candidate was found (shouldn't happen normally)
  if (bestBuildingCount === null || bestClock === null) {
    bestBuildingCount = 1
    bestClock = 250
  }

  group.buildingCount = bestBuildingCount
  group.overclockPercent = formatNumberFully(bestClock)
}

// This function will take the remainder of the building requirements and apply it to the last group. It will prefer using more buildings than overclocking, as power shards are harder to come by.
export const remainderToLast = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType,
  factory: Factory
) => {
  const groups = item.buildingGroups
  if (!groups || groups.length === 0) return

  // The last group is the one we adjust.
  const lastGroup = groups[groups.length - 1]

  bestEffortUpdateBuildingCount(item, lastGroup, groups, groupType)

  recalculateGroupMetrics(item, groupType, factory)
}

export const remainderToNewGroup = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType,
  factory: Factory
) => {
  const buildingCount = getBuildingCount(item, groupType)

  const remaining = buildingCount - calculateEffectiveBuildingCount(item.buildingGroups)

  if (remaining <= 0) {
    return // Nothing to do
  }

  if (groupType !== ItemType.Product && groupType !== ItemType.Power) {
    throw new Error('productBuildingGroups: remainderToNewGroup: Invalid group type!')
  }

  addBuildingGroup(item, groupType, factory)

  remainderToLast(item, groupType, factory)
  recalculateGroupMetrics(item, groupType, factory)
}

export const toggleBuildingGroupTray = (item: FactoryItem | FactoryPowerProducer) => {
  const buildingGroupTutorialOpened = localStorage.getItem('buildingGroupTutorialOpened')

  if (!buildingGroupTutorialOpened) {
    eventBus.emit('openBuildingGroupTutorial')
    localStorage.setItem('buildingGroupTutorialOpened', 'true')
  }

  item.buildingGroupsTrayOpen = !item.buildingGroupsTrayOpen
}

// Buckle up, this is gonna be a read.
// This function takes the part of the building group and calculates the required buildings and clock to make the amount happen.
// It can take both an ingredient and the product, using the same calculation to figure out the buildings required.
export const updateBuildingGroupViaPart = (
  group: BuildingGroup,
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType,
  factory: Factory,
  part: string,
  amount: number
) => {
  // 1. Update the part amount in this group.
  group.parts[part] = amount

  // 2. Retrieve the recipe details.
  const recipeUsed = item.recipe
  let recipe: Recipe | PowerRecipe | undefined
  if (groupType === ItemType.Product) {
    recipe = getRecipe(recipeUsed, gameData)
  } else if (groupType === ItemType.Power) {
    recipe = getPowerRecipe(recipeUsed, gameData)
  }
  if (!recipe) {
    throw new Error('updateBuildingGroupViaPart: Recipe not found!')
  }

  // 3. Find the recipe item corresponding to the updated part.
  // For Product recipes, check ingredients and then products.
  // For Power recipes, check ingredients first and then byproduct.
  let recipePart: any
  if (groupType === ItemType.Product) {
    const productRecipe = recipe as Recipe
    recipePart = productRecipe.ingredients.find(i => i.part === part)
    if (!recipePart) {
      recipePart = productRecipe.products.find(i => i.part === part)
    }
  } else if (groupType === ItemType.Power) {
    recipePart = recipe.ingredients.find(i => i.part === part)
    const powerRecipe = recipe as PowerRecipe
    if (!recipePart && powerRecipe.byproduct && powerRecipe.byproduct.part === part) {
      recipePart = powerRecipe.byproduct
    }
  }
  if (!recipePart) {
    throw new Error(`updateBuildingGroupViaPart: Part '${part}' not found in recipe!`)
  }

  // 4. Use the recipe item's "perMin" value as the baseline rate for one building running at 100%.
  const baseRate = recipePart.perMin
  if (!baseRate) {
    throw new Error(`updateBuildingGroupViaPart: perMin value for part '${part}' is not defined!`)
  }

  // 5. Calculate the target effective building count for this group.
  // E.g., if baseRate is 15 and amount is 20, then targetEffective ≈ 20/15 ≈ 1.33 buildings.
  const targetEffective = amount / baseRate

  // 6. Determine the best combination of whole building count and clock speed.
  // We prefer to have a clock percentage at or below 100%.
  if (targetEffective < 1) {
    group.buildingCount = 1
    group.overclockPercent = formatNumberFully(targetEffective * 100)
  } else {
    const maxCandidateCount = Math.ceil(targetEffective) + 1
    type Candidate = { buildingCount: number; clock: number; diff: number }
    let bestUnderCandidate: Candidate | null = null
    let bestOverCandidate: Candidate | null = null

    for (let n = 1; n <= maxCandidateCount; n++) {
      const rawClock = (targetEffective / n) * 100
      const candidateClock = Math.ceil(rawClock)
      if (candidateClock > 250) continue // skip candidates exceeding the game cap
      const diff = Math.abs(candidateClock - 100)
      if (candidateClock <= 100) {
        if (!bestUnderCandidate || diff < bestUnderCandidate.diff) {
          bestUnderCandidate = { buildingCount: n, clock: candidateClock, diff }
        }
      } else if (!bestOverCandidate || diff < bestOverCandidate.diff) {
        bestOverCandidate = { buildingCount: n, clock: candidateClock, diff }
      }
    }

    let chosenCandidate: Candidate
    if (bestUnderCandidate) {
      chosenCandidate = bestUnderCandidate
    } else if (bestOverCandidate) {
      chosenCandidate = bestOverCandidate
    } else {
      chosenCandidate = { buildingCount: 1, clock: 250, diff: Math.abs(250 - 100) }
    }

    group.buildingCount = chosenCandidate.buildingCount
    group.overclockPercent = formatNumberFully(chosenCandidate.clock)
  }

  // 7. Perform any additional calculations needed after updating the group.
  recalculateGroupMetrics(item, groupType, factory)
}

export const recalculateGroupMetrics = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType,
  factory: Factory
) => {
  // Run the calculations again on the changed group
  calculateBuildingGroupParts([item], groupType, factory)

  if (groupType === ItemType.Product) {
    const subject = item as FactoryItem
    calculateProductBuildingGroupPower(subject.buildingGroups, subject.buildingRequirements.name)
  } else {
    const subject = item as FactoryPowerProducer
    calculatePowerProducerBuildingGroupPower(subject.buildingGroups, subject.recipe)
  }
  calculateBuildingGroupProblems(item, groupType)
  calculateHasProblem(factory)
}

// Updates the item if the building group has been updated under certain conditions
export const checkForItemUpdate = (item: FactoryItem | FactoryPowerProducer, factory: Factory) => {
  if (item.buildingGroupItemSync) {
    const group = item.buildingGroups[0]

    const newBuildingCount = calculateEffectiveBuildingCount(item.buildingGroups)

    // Since we have edited the buildings in the group, we now need to edit the product's building requirements.
    if (group.type === ItemType.Product) {
      const subject = item as FactoryItem

      // We need to update the product via effective building count, not whole buildings.
      subject.buildingRequirements.amount = newBuildingCount

      increaseProductQtyViaBuilding(
        subject,
        factory, gameData,
        'buildingGroup'
      )
    } else if (group.type === ItemType.Power) {
      const subject = item as FactoryPowerProducer

      subject.buildingAmount = newBuildingCount
      subject.buildingCount = newBuildingCount
      subject.updated = FactoryPowerChangeType.Building
    } else {
      throw new Error('Invalid type')
    }
  }
}

export const deleteBuildingGroup = (
  item: FactoryItem | FactoryPowerProducer,
  group: BuildingGroup
) => {
  // If we only have 1 group, ignore the deletion.
  if (item.buildingGroups.length === 1) {
    return
  }

  // Disable the sync if we are deleting a group as otherwise it will malform the product.
  item.buildingGroupItemSync = false

  // Find the index of the group and remove it
  const index = item.buildingGroups.findIndex(g => g.id === group.id)
  item.buildingGroups.splice(index, 1)

  // Check if we're down to 1 group, if so re-enable sync
  if (item.buildingGroups.length === 1) {
    item.buildingGroupItemSync = true
  }

  // Must call calculateFactory or the parts are now out of sync!
}
