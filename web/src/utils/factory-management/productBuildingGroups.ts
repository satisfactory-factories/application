import { FactoryItem } from '@/interfaces/planner/FactoryInterface'
import eventBus from '@/utils/eventBus'
import { formatNumberFully } from '@/utils/numberFormatter'

export const addGroup = (product: FactoryItem, addBuildings = true) => {
  let buildingCount = 0
  if (addBuildings) {
    buildingCount = product.buildingRequirements.amount
  }

  product.buildingGroups.push({
    id: Math.floor(Math.random() * 10000),
    buildingCount,
    overclockPercent: 100,
    somersloops: 0,
    parts: {},
  })

  calculateBuildingGroupParts([product])
}

// Takes the building groups of a product and rebalances them based on the building count
export const rebalanceGroups = (product: FactoryItem) => {
  const targetBuildings = product.buildingRequirements.amount
  const groups = product.buildingGroups

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

  // Since we've messed with the building counts, recalculate all groups now.
  calculateBuildingGroupParts([product])
}

// Calculates all of the parts for a product based on the building groups
export const calculateBuildingGroupParts = (products: FactoryItem[]) => {
  // Handle any group part quantity changes.
  // Loop through all the building groups buildings and use that as relative to update each part quantities.
  for (const product of products) {
  // Firstly, check if the product needs any building groups as the user may have changed the product.
    if (product.id === '' || product.recipe === '') {
      product.buildingGroups = []
      continue // Skip this product
    }

    // Check if the product should have a product group
    if (product.buildingGroups.length === 0) {
      addGroup(product, true)
    }

    console.log('productBuildingGroups.ts calculateBuildingGroups product:', product.id)
    const totalBuildingCount = product.buildingRequirements.amount

    for (const group of product.buildingGroups) {
      for (const part in product.requirements) {
        const productPartRequirement = product.requirements[part].amount
        // We need to get a fraction based on the total amount required by the product and the number of buildings.
        const partPerBuilding = productPartRequirement / totalBuildingCount
        group.parts[part] = (partPerBuilding * group.buildingCount)
      }

      // Also figure out the parts for the product itself and byproduct
      const productPerBuilding = product.amount / totalBuildingCount
      group.parts[product.id] = productPerBuilding * group.buildingCount

      // And byproduct if applicable
      if (product.byProducts && product.byProducts.length > 0) {
        const byproductPerBuilding = product.byProducts[0].amount / totalBuildingCount
        group.parts[product.byProducts[0].id] = (byproductPerBuilding * group.buildingCount)
      }

      const overclockMulti = group.overclockPercent / 100

      // Now apply the overclock multiplier for all parts in the group
      for (const part in group.parts) {
        group.parts[part] = group.parts[part] * overclockMulti
      }
    }
  }
}

export const calculateEffectiveBuildingCount = (product: FactoryItem) => {
  // This takes the building groups and:
  // 1. Calculates the total building count
  // 2. Applies the overclocking to the building count to process the effective building count
  // 3. Adds this up for all groups

  let effectiveBuildingCount = 0
  for (const group of product.buildingGroups) {
    // Remember it is a percentage so we need to divide by 100
    const groupEffectiveBuildingCount = group.buildingCount * group.overclockPercent / 100
    effectiveBuildingCount += groupEffectiveBuildingCount
  }

  return formatNumberFully(effectiveBuildingCount)
}

// Brought to you courtesy of ChatGPT o3-mini-high.
// This function will take the remainder of the building requirements and apply it to the last group. It will prefer using more buildings than overclocking, as power shards are harder to come by.
export const remainderToLast = (product: FactoryItem) => {
  const groups = product.buildingGroups
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

  const targetEffective = product.buildingRequirements.amount
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
}

export const remainderToNewGroup = (product: FactoryItem) => {
  const remaining = product.buildingRequirements.amount - calculateEffectiveBuildingCount(product)

  if (remaining <= 0) {
    return // Nothing to do
  }

  addGroup(product)
  remainderToLast(product)
}

eventBus.on('rebalanceGroups', rebalanceGroups)
