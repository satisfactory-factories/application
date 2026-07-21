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
import { canBuildingOverclock, getPowerRecipe, getRecipe, isAlwaysSyncedBuilding } from '@/utils/factory-management/common'
import { PowerRecipe, Recipe } from '@/interfaces/Recipes'
import { increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
import { CalculationModes } from '@/utils/factory-management/factory'
import {
  getSomersloopIngredientFactor,
  getSomersloopOutputMultiplier,
  getSomersloopPowerMultiplier,
} from '@/utils/factory-management/building-groups/somersloops'

const gameData = await fetchGameData()

export const addBuildingGroup = (
  item: FactoryItem | FactoryPowerProducer,
  type: ItemType,
  factory: Factory,
) => {
  // If there is no building groups, grab the building requirements and add a building group.
  // This is done from within each method as there's different ways of accessing the building counts.
  const addBuildings = item.buildingGroups.length === 0

  // If we have a second group, we need to disable sync. Exception: always-synced
  // buildings (fuel-less generators) have nothing to fine-tune, so sync stays on.
  if (item.buildingGroups.length > 0 && !isAlwaysSyncedBuilding(getItemBuilding(item, type))) {
    item.buildingGroupItemSync = false
  } else {
    // We always want sync enabled for the first group.
    item.buildingGroupItemSync = true
  }

  if (type === ItemType.Product) {
    addProductBuildingGroup(item as FactoryItem, factory, addBuildings)
  } else if (type === ItemType.Power) {
    addPowerProducerBuildingGroup(item as FactoryPowerProducer, factory, addBuildings)
  } else {
    throw new Error(`addBuildingGroup: Invalid group type: ${type}`)
  }

  // Recalculate the group metrics
  recalculateGroupMetrics(item, type, factory)
}

// @See ./product.ts, ./power.ts for usages
export const createBuildingGroup = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType,
  matchBuildings = true
) => {
  let buildingCount = 0

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

  // New groups always contain at least 1 building — a 0-building group is useless
  // to the user and invites division by zero in the part calculations.
  if (buildingCount === 0) {
    buildingCount = 1
  }

  item.buildingGroups.push({
    id: Math.floor(Math.random() * 10000),
    type: groupType,
    buildingCount,
    overclockPercent: 100,
    somersloops: 0,
    parts: {},
    powerUsage: 0,
    powerProduced: 0,
  })
}

// Resolves the physical building name for an item, used for somersloop slot lookups.
export const getItemBuilding = (item: FactoryItem | FactoryPowerProducer, groupType: ItemType): string => {
  if (groupType === ItemType.Product) {
    return (item as FactoryItem).buildingRequirements?.name ?? ''
  }
  return (item as FactoryPowerProducer).building ?? ''
}

// This takes the building groups and:
// 1. Calculates the total building count
// 2. Applies the overclocking to the building count to process the effective building count
// 3. Applies the somersloop output multiplier, so "effective" means output-effective:
//    a fully slooped smelter at 100% counts as 2 effective buildings' worth of production.
export const calculateEffectiveBuildingCount = (buildingGroups: BuildingGroup[], building = '') => {
  let effectiveBuildingCount = 0
  for (const group of buildingGroups) {
    const sloopMultiplier = getSomersloopOutputMultiplier(group, building)
    // Remember it is a percentage so we need to divide by 100. Clocks support 4 decimal
    // places, so keep the full precision here (e.g. 223.33% must stay 2.2333, not 2.233).
    effectiveBuildingCount += formatNumberFully(group.buildingCount * group.overclockPercent / 100 * sloopMultiplier, 4)
  }

  return formatNumberFully(effectiveBuildingCount, 4)
}

// Total power shards needed by the groups. Each shard raises a building's max clock
// by 50%, so clocks >100% need 1 shard per building, >150% need 2, >200% need 3 (game cap 250%).
export const getTotalPowerShards = (buildingGroups: BuildingGroup[] | undefined): number => {
  if (!buildingGroups?.length) {
    return 0
  }

  let total = 0
  for (const group of buildingGroups) {
    if (group.overclockPercent <= 100) {
      continue
    }

    const shardsPerBuilding = Math.min(Math.ceil((group.overclockPercent - 100) / 50), 3)
    const perGroup = shardsPerBuilding * group.buildingCount
    if (Number.isFinite(perGroup)) {
      total += perGroup
    }
  }

  return total
}

export const calculateRemainingBuildingCount = (item: FactoryItem | FactoryPowerProducer, groupType: ItemType) => {
  let subject: FactoryItem | FactoryPowerProducer

  const effectiveBuildings = calculateEffectiveBuildingCount(item.buildingGroups, getItemBuilding(item, groupType))

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
  recipeId?: string,
) => {
  // Variable-power buildings (Particle Accelerator, Converter, Quantum Encoder) carry their
  // real draw on the recipe (avg/min/max); the flat buildings map only holds their standby
  // power (0.1 MW), so it must not be used for them.
  const recipe = recipeId ? getRecipe(recipeId, gameData) : undefined
  const recipeBuilding = recipe?.building.minPower !== undefined && recipe?.building.maxPower !== undefined
    ? recipe.building
    : undefined

  buildingGroups.forEach(group => {
    // In order to figure this out, we need to:
    // 1. Get the original building's power
    // 2. Times the building's power by the overclock percentage, with the ratio of: powerusage=initialpowerusage×(clockspeed100)1.321928

    // Get the building's details
    const consumptionPerBuilding = recipeBuilding?.power ?? gameData.buildings[building]

    if (consumptionPerBuilding === undefined) {
      // throw new Error(`productBuildingGroups: calculateProductBuildingGroupPower: Building not found! ${building}`)
      return
    }

    // Now, using the formula above, we calculate the power usage.
    // Somersloops stack multiplicatively: power x (1 + filled/slots)^2, so a fully
    // slooped building at 250% clock draws ~13.43x its base power.
    const clockAndSloopFactor = Math.pow(group.overclockPercent / 100, 1.321928) *
      getSomersloopPowerMultiplier(group, building) *
      group.buildingCount

    group.powerUsage = formatNumberFully(consumptionPerBuilding * clockAndSloopFactor, 4)
    // The min/max draw scales by the same clock and somersloop factors as the average.
    group.powerUsageMin = recipeBuilding
      ? formatNumberFully((recipeBuilding.minPower ?? 0) * clockAndSloopFactor, 4)
      : group.powerUsage
    group.powerUsageMax = recipeBuilding
      ? formatNumberFully((recipeBuilding.maxPower ?? 0) * clockAndSloopFactor, 4)
      : group.powerUsage
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

    // Fuel-less generators (Geothermal, Alien Power Augmenter) have no shard slots.
    if (!canBuildingOverclock(powerRecipe.building.name)) {
      group.overclockPercent = 100
      group.clockSetByUser = false
    }

    // Power production for power producers is a bit different, it is a flat 1:1 ratio
    const clockedBuildings = group.buildingCount * group.overclockPercent / 100

    group.powerProduced = formatNumberFully(powerRecipe.building.power * clockedBuildings, 4)
    // Variable-output generators (Geothermal) oscillate between min and max around the average.
    group.powerProducedMin = powerRecipe.building.minPower !== undefined
      ? formatNumberFully(powerRecipe.building.minPower * clockedBuildings, 4)
      : group.powerProduced
    group.powerProducedMax = powerRecipe.building.maxPower !== undefined
      ? formatNumberFully(powerRecipe.building.maxPower * clockedBuildings, 4)
      : group.powerProduced
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
    // Items from old saves may predate the buildingGroups field (migration runs later in load).
    if (!item.buildingGroups) {
      item.buildingGroups = []
    }

    // Firstly, check if the item needs any building groups as the user may have changed the product.
    if (item.id === '' || item.recipe === '') {
      item.buildingGroups.splice(0)
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

    // Track which parts are outputs — somersloops amplify outputs only, never ingredients.
    const outputParts = new Set<string>()

    // Recipe ingredient rates (per building @ 100%). Ingredient consumption is a pure
    // function of the group's own physical buildings and clock, so we compute it directly
    // from these rather than round-tripping through the item's (amount-derived, sloop-
    // discounted) requirements — that round-trip accumulates rounding and makes a group's
    // ingredient drift by 0.001 whenever the item amount shifts (see calculateProducts).
    const ingredientRates: { [part: string]: number } = {}

    if (type === ItemType.Product) {
      const subject = item as FactoryItem
      const productRecipe = getRecipe(subject.recipe, gameData)
      productRecipe?.ingredients.forEach(ingredient => {
        ingredientRates[ingredient.part] = ingredient.perMin
      })

      for (
        const [part, partData] of Object.entries(subject.requirements)
      ) {
        parts[part] = partData.amount
      }

      // Also add the product and byproduct
      parts[subject.id] = subject.amount
      outputParts.add(subject.id)
      if (subject.byProducts && subject.byProducts.length > 0) {
        parts[subject.byProducts[0].id] = subject.byProducts[0].amount
        outputParts.add(subject.byProducts[0].id)
      }
    } else if (type === ItemType.Power) {
      const subject = item as FactoryPowerProducer
      const recipe = getPowerRecipe(subject.recipe, gameData)
      if (!recipe) {
        throw new Error('productBuildingGroups: calculateBuildingGroupParts: Recipe not found!')
      }

      // Alien Power Augmenter: matrix demand belongs only to the groups toggled to
      // supply matrixes — it must not be spread across all buildings like regular fuel.
      if (recipe.boost) {
        const boost = recipe.boost
        item.buildingGroups.forEach(group => {
          group.parts = group.supplyMatrixes
            ? { [boost.fuelPart]: formatNumberFully(boost.fuelRatePerMin * group.buildingCount, 3) }
            : {}
        })
        continue
      }

      // If ingredients are missing, fill them now
      if (subject.ingredients.length === 0) {
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

    const building = getItemBuilding(item, type)

    // The item's ingredient requirements carry the somersloop ingredient discount
    // (see calculateProducts). Dividing it back out here means the per-building split
    // below always works with plain recipe rates for ingredients.
    const ingredientFactor = getSomersloopIngredientFactor(item.buildingGroups, building)

    // Now we have the parts, we can calculate the parts per building
    for (const group of item.buildingGroups) {
      Object.entries(parts).forEach(([partKey, amount]) => {
        if (partKey === exclude) {
          return // Skip this part so we don't cause an update storm.
        }

        // Pure ingredients: derive straight from the recipe rate and this group's own
        // buildings, so the value tracks the group's clock exactly and never drifts with
        // the item amount. Outputs (and any part without a known rate) keep the split of
        // the item's total across the groups by building count.
        if (!outputParts.has(partKey) && ingredientRates[partKey] !== undefined) {
          group.parts[partKey] = ingredientRates[partKey] * group.buildingCount
          return
        }

        // Calculate the amount of parts per building, based off total building count to get the per building amount
        let partPerBuilding = 0
        if (totalBuildingCount > 0) {
          partPerBuilding = amount / totalBuildingCount
        }

        if (!outputParts.has(partKey)) {
          partPerBuilding = partPerBuilding / ingredientFactor
        }

        // Now multiply the per building amount by the number of buildings in the group to get the true amount.
        group.parts[partKey] = (partPerBuilding * group.buildingCount)
      })

      const overclockMulti = group.overclockPercent / 100

      // Somersloops amplify the group's outputs only; ingredient consumption is untouched.
      const sloopMultiplier = getSomersloopOutputMultiplier(group, building)

      // Now apply the overclock multiplier for all parts in the group
      for (const part in group.parts) {
        const outputMulti = outputParts.has(part) ? sloopMultiplier : 1
        group.parts[part] = formatNumberFully(group.parts[part] * overclockMulti * outputMulti, 3)
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
  const effectiveBuildingCount = calculateEffectiveBuildingCount(item.buildingGroups, getItemBuilding(item, groupType))

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

  // A group set totalling zero buildings while the item itself has some is degenerate —
  // there is no user craft to preserve. This happens when a producer defined only by its
  // power amount (e.g. a plan template) gets its default group before any calculation has
  // derived a building count. Rebuild the groups from the item rather than letting the
  // sacrosanct rule below sync the item down to nothing.
  const groupsAreDegenerate =
    item.buildingGroups.reduce((acc, group) => acc + group.buildingCount, 0) === 0 &&
    getBuildingCount(item, groupType) > 0

  // Recalculations treat building groups as SACROSANCT: the user may have spent a lot of
  // time crafting exact counts and clocks, so they are never rebalanced — item quantities
  // are adjusted to match the groups instead (see calculateFactory).
  if (modes.origin === 'recalculate' && !groupsAreDegenerate) {
    return
  }

  // If originating from the item, cause a rebalance.
  if (modes.forceRebalance || groupsAreDegenerate || (modes.origin !== 'buildingGroup' && item.buildingGroupItemSync)) {
    const building = getItemBuilding(item, groupType)
    const groups = item.buildingGroups
    let targetBuildings: number

    // If the update was triggered from the building group, we need to use the totalled building count derived from the building groups.
    if (modes.useBuildingGroupBuildings) {
      targetBuildings = calculateEffectiveBuildingCount(item.buildingGroups, building)
    } else {
      targetBuildings = getBuildingCount(item, groupType)

      // If the groups already fulfil the item exactly (within float noise), leave them
      // exactly as configured — a rebalance would stomp custom counts and clocks for no
      // benefit. Any real change to the item's requirement still rebalances. Groups with
      // fractional building counts are excluded: those are freshly derived from the item
      // and still need normalizing into whole buildings with an underclock.
      const groupsAreWholeBuildings = groups.every(group => Number.isInteger(group.buildingCount))
      if (
        !modes.forceRebalance &&
        groupsAreWholeBuildings &&
        Math.abs(calculateEffectiveBuildingCount(groups, building) - targetBuildings) <= 0.001
      ) {
        return
      }
    }

    // Divide the target equally among groups. The target is in output-effective
    // buildings, so a group's somersloop boost reduces the physical buildings it needs.
    const targetPerGroup = targetBuildings / groups.length

    groups.forEach(group => {
      const physicalTarget = targetPerGroup / getSomersloopOutputMultiplier(group, building)

      // Whole scenario: the group gets exactly the physical target at 100%.
      // Fractional scenario: round the buildings up and underclock so that
      // effective production is exactly targetPerGroup.
      const isWhole = Math.abs(physicalTarget - Math.round(physicalTarget)) < 1e-9

      if (isWhole) {
        group.buildingCount = Math.round(physicalTarget)
        group.overclockPercent = 100
      } else {
        group.buildingCount = Math.ceil(physicalTarget)
        // Clocks support 4 decimal places in-game, so match that precision.
        group.overclockPercent = formatNumberFully((physicalTarget / group.buildingCount) * 100, 4)
      }
      group.clockSetByUser = false // Solver-derived clock, not user precision
    })

    // Recalculate the group metrics after the rebalance.
    recalculateGroupMetrics(item, groupType, factory)
  }
}

// Scenario:
// 1. The user has a product with a single building group.
// 2. We are trying to calculate the number of buildings and clock speed required.
// 3. We are trying to match the target building count, but we cannot use overclocking, we must underclock.
// 4. E.g. we have 2.5 buildings (effectiveExcludingTarget), we need to use 3 buildings and underclock all of them to 83.333333333% to spread to 2.5.
// 5. This is a best effort attempt to fulfil the needs of the item by spreading it over the building group(s).
// 6. The user will be informed that their clock is not computationally precise elsewhere. This is a best effort solution.

// This function attempts to match the target building count via both over-allocating buildings and underclocking the remainder.
// This is an best effort attempt to fulfil the needs of the item by spreading it over the building group(s). This is also in effect the rebalance function.
export const bestEffortUpdateBuildingCount = (
  item: FactoryItem | FactoryPowerProducer,
  group: BuildingGroup,
  targetAmountForGroup: number,
  type: ItemType,
) => {
  if (targetAmountForGroup <= 0) {
    // If the group should have no amount, just set it to 0
    group.buildingCount = 0
    group.overclockPercent = 0
    group.clockSetByUser = false
    return
  }

  // To handle imprecision, we have to get the original ratio out of the recipe so we have more precise numbers to play with.
  const recipeUsed = item.recipe
  let perMin = 1
  let recipe: Recipe | PowerRecipe | undefined
  if (type === ItemType.Product) {
    recipe = getRecipe(recipeUsed, gameData)
  } else if (type === ItemType.Power) {
    recipe = getPowerRecipe(recipeUsed, gameData)
  }

  if (!recipe) {
    throw new Error('bestEffortUpdateBuildingCount: Recipe not found!')
  }

  if (type === ItemType.Product) {
    const productRecipe = recipe as Recipe
    perMin = productRecipe?.products[0].perMin
  } else if (type === ItemType.Power) {
    const powerRecipe = recipe as PowerRecipe
    perMin = powerRecipe?.ingredients[0].perMin
  }

  // Go through each group, and allocate the best building count and clock speeds, across the groups.
  // Firstly though we need to understand what the calculation of the clock speed is, when spread across the groups.
  // A slooped group produces more per building, so it needs proportionally fewer physical buildings.
  const sloopMultiplier = getSomersloopOutputMultiplier(group, getItemBuilding(item, type))
  const buildingsNeeded = targetAmountForGroup / (perMin * sloopMultiplier)

  /*
    For a positive gap, instead of defaulting to a single building and overclocking it, we try to find a better solution using less buildings.
    We will loop each time until the desired clock is less than 100%, then based off that calculate the number of buildings at a sub 100% clock to achieve the end result.
  */
  const maxN = Math.ceil(buildingsNeeded) // a reasonable search range
  let bestBuildingCount: number | null = null
  let bestClock: number = Number.POSITIVE_INFINITY

  for (let candidateBuildings = 1; candidateBuildings <= maxN; candidateBuildings++) {
    const candidateClock = (buildingsNeeded / candidateBuildings) * 100
    if (candidateClock <= 100) {
      bestBuildingCount = candidateBuildings
      bestClock = candidateClock
      break
    }
  }

  // Fallback if no candidate was found (shouldn't happen normally)
  if (bestBuildingCount === null || bestClock === null) {
    bestBuildingCount = 1
    bestClock = 250
  }

  // Apply the best building count and clock speed to the group
  group.buildingCount = bestBuildingCount
  group.overclockPercent = formatNumberFully(bestClock, 4)
  group.clockSetByUser = false // Solver-derived clock, not user precision
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
  const otherGroups = groups.slice(0, -1)
  const otherEffective = Number(calculateEffectiveBuildingCount(otherGroups, getItemBuilding(item, groupType)))

  // Calculate total target amount
  let totalTargetAmount = 0
  let perMin = 0
  const recipeUsed = item.recipe
  if (groupType === ItemType.Product) {
    const subject = item as FactoryItem
    totalTargetAmount = subject.amount
    const recipe = getRecipe(recipeUsed, gameData)
    perMin = recipe?.products[0].perMin ?? 1
  } else {
    const subject = item as FactoryPowerProducer
    totalTargetAmount = subject.fuelAmount
    const recipe = getPowerRecipe(recipeUsed, gameData)
    perMin = recipe?.ingredients[0].perMin ?? 1
  }

  const otherAmount = otherEffective * perMin
  const lastTargetAmount = totalTargetAmount - otherAmount

  bestEffortUpdateBuildingCount(item, lastGroup, lastTargetAmount, groupType)

  recalculateGroupMetrics(item, groupType, factory)
}

export const remainderToNewGroup = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: ItemType,
  factory: Factory
) => {
  const buildingCount = getBuildingCount(item, groupType)

  const remaining = buildingCount - calculateEffectiveBuildingCount(item.buildingGroups, getItemBuilding(item, groupType))

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
  let partIsOutput = false
  if (groupType === ItemType.Product) {
    const productRecipe = recipe as Recipe
    recipePart = productRecipe.ingredients.find(i => i.part === part)
    if (!recipePart) {
      recipePart = productRecipe.products.find(i => i.part === part)
      partIsOutput = !!recipePart
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
  // Somersloops amplify outputs, so a slooped building's baseline output rate is higher —
  // ingredient rates are unaffected.
  let baseRate = recipePart.perMin
  if (!baseRate) {
    throw new Error(`updateBuildingGroupViaPart: perMin value for part '${part}' is not defined!`)
  }
  if (partIsOutput) {
    baseRate = baseRate * getSomersloopOutputMultiplier(group, getItemBuilding(item, groupType))
  }

  // 5. Calculate the target effective building count for this group.
  // E.g., if baseRate is 15 and amount is 20, then targetEffective ≈ 20/15 ≈ 1.33 buildings.
  const targetEffective = amount / baseRate

  // 5a. If the user has dialed in an overclock, their building count is deliberate — keep
  // it and simply rescale the clock to hit the new output. Re-solving the count/clock
  // (step 6) prefers spreading the work across more buildings at a sub-100% clock, which
  // blows away the delicate setup (e.g. 1 building @ 223.333% becoming 3 @ 75%). Only do
  // this while the resulting clock stays within the game's 0–250% range; otherwise fall
  // through to a full re-solve.
  if (group.overclockPercent > 100 && group.buildingCount >= 1) {
    const preservedClock = (targetEffective / group.buildingCount) * 100
    if (preservedClock > 0 && preservedClock <= 250) {
      group.overclockPercent = formatNumberFully(preservedClock, 4)
      recalculateGroupMetrics(item, groupType, factory)
      return
    }
  }

  // 6. Determine the best combination of whole building count and clock speed.
  // We prefer to have a clock percentage at or below 100%.
  if (targetEffective < 1) {
    group.buildingCount = 1
    // Clocks support 4 decimal places in-game, so match that precision.
    group.overclockPercent = formatNumberFully(targetEffective * 100, 4)
    group.clockSetByUser = false // Solver-derived clock, not user precision
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
    group.clockSetByUser = false // Solver-derived clock, not user precision
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
    calculateProductBuildingGroupPower(subject.buildingGroups, subject.buildingRequirements.name, subject.recipe)
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

    const newBuildingCount = calculateEffectiveBuildingCount(item.buildingGroups, getItemBuilding(item, group.type))

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

      // increaseProductQtyViaBuilding derives the amount from the 4dp-rounded effective
      // building count (calculateEffectiveBuildingCount), which drifts from the group's own
      // output — e.g. 1 building @ 223.333% with a somersloop rounds to 3.35, giving
      // 3.35 * 120 = 402, while the group produces 401.999. Recompute the amount from the
      // full-precision effective building count so the qty/min matches the building groups
      // to the game's 3 decimal places.
      const recipe = getRecipe(subject.recipe, gameData)
      if (recipe) {
        const building = getItemBuilding(subject, ItemType.Product)
        const preciseEffective = subject.buildingGroups.reduce(
          (sum, g) => sum + (g.buildingCount * g.overclockPercent / 100 * getSomersloopOutputMultiplier(g, building)),
          0
        )
        subject.amount = formatNumberFully(recipe.products[0].perMin * preciseEffective)
      }
    } else if (group.type === ItemType.Power) {
      const subject = item as FactoryPowerProducer

      subject.buildingAmount = newBuildingCount
      subject.buildingCount = newBuildingCount
      subject.updated = FactoryPowerChangeType.Building
    } else {
      throw new Error('Invalid type')
    }

    // The problem flag was computed during the group sync, BEFORE this writeback —
    // against the item's stale building count. The item now matches the groups again
    // (e.g. after adding a somersloop with sync on), so refresh it or it sticks red.
    calculateBuildingGroupProblems(item, group.type)
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

  // Must call calculateFactory or the parts are now out of sync!
}
