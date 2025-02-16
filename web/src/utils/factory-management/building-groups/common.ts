import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerProducer,
  GroupType,
} from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'
import { fetchGameData } from '@/utils/gameDataService'
import { calculateHasProblem } from '@/utils/factory-management/problems'
import { getRecipe } from '@/utils/factory-management/common'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'

const gameData = await fetchGameData()

export const addBuildingGroup = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: GroupType,
  addBuildings = true
) => {
  let subject: FactoryItem | FactoryPowerProducer
  if (groupType === GroupType.Product) {
    subject = item as FactoryItem
  } else if (groupType === GroupType.Power) {
    subject = item as FactoryPowerProducer
  } else {
    throw new Error(`addBuildingGroup: Invalid group type: ${groupType}`)
  }

  let buildingCount = 0
  if (addBuildings) {
    if (groupType === GroupType.Product) {
      subject = item as FactoryItem // TS... why...
      buildingCount = subject.buildingRequirements.amount
    } else if (groupType === GroupType.Power) {
      subject = item as FactoryPowerProducer // TS... why...
      buildingCount = subject.buildingCount
    }
  }

  subject.buildingGroups.push({
    id: Math.floor(Math.random() * 10000),
    buildingCount,
    overclockPercent: 100,
    parts: {},
    powerUsage: 0,
    type: groupType,
  })
}

export const calculateEffectiveBuildingCount = (buildingGroups: BuildingGroup[]) => {
  // This takes the building groups and:
  // 1. Calculates the total building count
  // 2. Applies the overclocking to the building count to process the effective building count
  // 3. Adds this up for all groups

  let effectiveBuildingCount = 0
  for (const group of buildingGroups) {
    // Remember it is a percentage so we need to divide by 100
    const groupEffectiveBuildingCount = group.buildingCount * group.overclockPercent / 100
    effectiveBuildingCount += groupEffectiveBuildingCount
  }

  return formatNumberFully(effectiveBuildingCount)
}

export const calculateBuildingGroupPower = (buildingGroups: BuildingGroup[], building: string) => {
  buildingGroups.forEach(group => {
    // In order to figure this out, we need to:
  // 1. Get the original building's power
  // 2. Times the building's power by the overclock percentage, with the ratio of: powerusage=initialpowerusage×(clockspeed100)1.321928

    // Get the building's details
    const buildingPower = gameData.buildings[building]

    if (!buildingPower) {
      throw new Error(`productBuildingGroups: calculateGroupPower: Building not found! ${building}`)
    }

    // Now, using the formula above, we calculate the power usage.
    const powerUsagePerBuilding = buildingPower * Math.pow(group.overclockPercent / 100, 1.321928)

    // Now multiply it by number of buildings and return
    group.powerUsage = formatNumberFully(powerUsagePerBuilding * group.buildingCount, 4)
  })
}

export const getBuildingCount = (item: FactoryItem | FactoryPowerProducer, groupType: GroupType) => {
  let buildingCount = 0
  if (groupType === GroupType.Product) {
    const product = item as FactoryItem
    buildingCount = product.buildingRequirements.amount
  } else if (groupType === GroupType.Power) {
    const producer = item as FactoryPowerProducer
    buildingCount = producer.buildingCount
  } else {
    throw new Error('productBuildingGroups: remainderToLast: Invalid group type!')
  }

  return buildingCount
}

// Calculates whether the building group passes it's requirements for effective buildings
export const calculateBuildingGroupProblems = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: GroupType
) => {
  // Get the effective building count
  const effectiveBuildingCount = calculateEffectiveBuildingCount(item.buildingGroups)

  // If the effective building count is out of whack between -0.1 and 0.1, we mark it as having a problem.
  const buildingCount = getBuildingCount(item, groupType)
  const absDiff = Math.abs(buildingCount - effectiveBuildingCount)

  item.buildingGroupsHaveProblem = absDiff > 0.1
}
// Takes the building groups and rebalances them based on the building count
export const rebalanceProductGroups = (item: FactoryItem | FactoryPowerProducer, force = false, changeBuildings = true) => {
  // Prevent rebalancing when in advanced mode
  if (!force && item.buildingGroups.length > 1) {
    console.log('productBuildingGroups: rebalanceGroups: Rebalance skipped due to advanced mode')
    return
  }

  const targetBuildings = getBuildingCount(item, GroupType.Product)
  const groups = item.buildingGroups

  // Divide the target equally among groups.
  const targetPerGroup = targetBuildings / groups.length
  const remainder = targetBuildings % groups.length
  const hasRemainder = remainder ? 1 : 0

  groups.forEach(group => {
    // Even scenario: each group gets exactly the quotient.
    // Odd scenario: each group gets one more building than the quotient (i.e., ceil).
    if (changeBuildings) {
      group.buildingCount = hasRemainder ? Math.ceil(targetPerGroup) : Math.floor(targetPerGroup)
    }

    // Set overclock percentage.
    // Even: no adjustment needed (100%).
    // Odd: underclock so that effective production is exactly targetPerGroup.
    if (hasRemainder) {
      group.overclockPercent = formatNumberFully((targetPerGroup / group.buildingCount) * 100)
    } else {
      group.overclockPercent = 100
    }
  })

  // Whatever calls this should call calculateBuildingGroupParts afterwards.
}
// Brought to you courtesy of ChatGPT o3-mini-high.
// This function will take the remainder of the building requirements and apply it to the last group. It will prefer using more buildings than overclocking, as power shards are harder to come by.
export const remainderToLast = (
  item: FactoryItem | FactoryPowerProducer,
  type: GroupType,
  factory: Factory
) => {
  const groups = item.buildingGroups
  if (!groups || groups.length === 0) return

  // The last group is the one we adjust.
  const lastGroup = groups[groups.length - 1]

  // Compute the effective building count for all groups EXCEPT the last.
  const effectiveExcludingLast = groups
    .slice(0, -1)
    .reduce((total, group) => {
      const percent = group.overclockPercent ?? 100
      return total + group.buildingCount * (percent / 100)
    }, 0)

  const targetEffective = getBuildingCount(item, type)
  const desiredFraction = targetEffective - effectiveExcludingLast

  // If no gap, nothing to do.
  if (desiredFraction === 0) return

  // Handle overproduction (gap negative)
  if (desiredFraction < 0) {
    lastGroup.buildingCount = 1
    lastGroup.overclockPercent = formatNumberFully((1 + desiredFraction) * 100)
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
  let bestN: number | null = null
  let bestClock: number | null = null
  let bestDiff = Number.POSITIVE_INFINITY

  for (let n = 1; n <= maxN; n++) {
    const rawClock = (desiredFraction / n) * 100
    const candidateClock = Math.ceil(rawClock)
    if (candidateClock > 250) continue // game cap: skip any candidate over 250%
    const diff = Math.abs(candidateClock - 100)
    if (diff < bestDiff) {
      bestDiff = diff
      bestN = n
      bestClock = candidateClock
    }
  }

  // Fallback if no candidate was found (shouldn't happen normally)
  if (bestN === null || bestClock === null) {
    bestN = 1
    bestClock = 250
  }

  lastGroup.buildingCount = bestN
  lastGroup.overclockPercent = formatNumberFully(bestClock)
  calculateBuildingGroupProblems(item, type)
  calculateHasProblem(factory)
}
export const remainderToNewGroup = (
  item: FactoryItem | FactoryPowerProducer,
  groupType: GroupType,
  factory: Factory
) => {
  const buildingCount = getBuildingCount(item, groupType)

  const remaining = buildingCount - calculateEffectiveBuildingCount(item.buildingGroups)

  if (remaining <= 0) {
    return // Nothing to do
  }

  if (groupType === GroupType.Product) {
    const subject = item as FactoryItem
    addProductBuildingGroup(subject)
  }

  remainderToLast(item, groupType, factory)
}
export const buildingsNeededForPart = (
  part: string,
  amount: number,
  product: FactoryItem,
  buildingGroup: BuildingGroup
) => {
  // Get the recipe for the product in order to get the new quantity
  const recipe = getRecipe(product.recipe, gameData)

  if (!recipe) {
    throw new Error('productBuildingGroups: buildingsNeededForPart: Recipe not found!')
  }

  // From the recipe, figure out how many buildings will be needed.
  // Determine if the part is an ingredient or a (by)product
  const isIngredient = recipe.ingredients.find(ingredient => ingredient.part === part)
  const isProduct = recipe.products.find(product => product.part === part) // Also handles byproducts as they're the same thing in terms of recipe.

  if (isIngredient && !isProduct) {
    // This is an ingredient
    const perMinOverclocked = isIngredient.perMin * buildingGroup.overclockPercent / 100
    return formatNumberFully(amount / perMinOverclocked)
  }

  if (isProduct && !isIngredient) {
    // This is a product
    const perMinOverclocked = isProduct.perMin * buildingGroup.overclockPercent / 100
    return formatNumberFully(amount / perMinOverclocked)
  }

  return 0
}
