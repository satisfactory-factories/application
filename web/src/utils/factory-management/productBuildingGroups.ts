import { FactoryItem } from '@/interfaces/planner/FactoryInterface'
import eventBus from '@/utils/eventBus'
import { formatNumberFully } from '@/utils/numberFormatter'

export const addGroup = (product: FactoryItem) => {
  product.buildingGroups.push({
    id: Math.floor(Math.random() * 10000),
    buildingCount: 0,
    overclockPercent: 100,
    somersloops: 0,
    parts: {},
    notes: '',
  })

  calculateBuildingGroupParts([product])
}

// Takes the building groups of a product and rebalances them based on the building count
export const rebalanceGroups = (product: FactoryItem) => {
  const targetBuildings = product.buildingRequirements.amount
  const groups = product.buildingGroups

  // Based on the number of groups, divide the target by the number of groups
  const targetPerGroup = targetBuildings / groups.length
  const remainder = targetBuildings % groups.length
  const hasRemainder = remainder ? 1 : 0
  // Set the building count for each group
  groups.forEach((group, index) => {
    group.buildingCount = hasRemainder ? Math.ceil(targetPerGroup) : Math.floor(targetPerGroup)

    // If the building count is not a whole number, apply a clock to the whole group
    if (hasRemainder) {
      group.overclockPercent = formatNumberFully(
        (targetPerGroup / group.buildingCount) * 100
      )
    } else {
      group.overclockPercent = 100
    }
  })
}

// Maintains the factory's building groups and keeps them synchronised.
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
      addGroup(product)
    }

    console.log('productBuildingGroups.ts calculateBuildingGroups product:', product.id)
    const totalBuildingCount = product.buildingRequirements.amount
    for (const group of product.buildingGroups) {
      for (const part in product.requirements) {
        const productPartRequirement = product.requirements[part].amount
        // We need to get a fraction based on the total amount required by the product and the number of buildings.
        const partPerBuilding = productPartRequirement / totalBuildingCount
        const partAmount = partPerBuilding * group.buildingCount

        group.parts[part] = partAmount
        group.parts[product.id] = partAmount
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

export const remainderToLast = (product: FactoryItem) => {
  const groups = product.buildingGroups
  if (!groups || groups.length === 0) return

  // The last group is the one to adjust.
  const lastGroup = groups[groups.length - 1]

  // Compute effective count for all groups EXCEPT the last one.
  const effectiveExcludingLast = groups
    .slice(0, -1)
    .reduce((total, group) => {
      // Assume overclockPercent defaults to 100 if not set.
      const percent = group.overclockPercent ?? 100
      return total + group.buildingCount * (percent / 100)
    }, 0)

  // For a dedicated fractional (last) group, we assume the overall target effective
  // count should be the requirement plus the effective contribution of the fractional group.
  // In your example you want group0’s 131 plus 0.1 from group1 to equal 131.1.
  // (If there is only one group, you may wish to simply target the requirement exactly.)
  const targetEffective = product.buildingRequirements.amount

  // The effective contribution needed from the last group.
  const desiredFraction = targetEffective - effectiveExcludingLast

  // If the desiredFraction is exactly a whole number, just add whole buildings:
  if (desiredFraction % 1 === 0) {
    lastGroup.buildingCount = desiredFraction
    lastGroup.overclockPercent = 100
  } else {
    // For a fractional group, force buildingCount to 1
    lastGroup.buildingCount = 1
    // If desiredFraction is negative, then we run below 100%:
    if (desiredFraction < 0) {
      lastGroup.overclockPercent = formatNumberFully((1 + desiredFraction) * 100)
    } else {
      lastGroup.overclockPercent = formatNumberFully(desiredFraction * 100)
    }
  }
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
