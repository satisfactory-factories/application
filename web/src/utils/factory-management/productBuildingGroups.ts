import { FactoryItem } from '@/interfaces/planner/FactoryInterface'
import eventBus from '@/utils/eventBus'
import { formatNumberFully } from '@/utils/numberFormatter'

export const addGroup = (product: FactoryItem, balance = true) => {
  product.buildingGroups.push({
    id: Math.floor(Math.random() * 10000),
    buildingCount: 0,
    overclockPercent: 100,
    somersloops: 0,
    parts: {},
    notes: '',
  })

  if (balance) {
    rebalanceGroups(product)
  }
  calculateBuildingGroupParts([product])
}

// Takes the building groups of a product and rebalances them based on the building count
export const rebalanceGroups = (product: FactoryItem) => {
  const targetBuildings = product.buildingRequirements.amount
  const groups = product.buildingGroups

  // Based on the number of groups, divide the target by the number of groups
  const targetPerGroup = Math.floor(targetBuildings / groups.length)
  const remainder = targetBuildings % groups.length

  // Set the building count for each group
  groups.forEach((group, index) => {
    const hasRemainder = index < remainder ? 1 : 0
    group.buildingCount = targetPerGroup + (index < remainder ? 1 : 0)

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

eventBus.on('rebalanceGroups', rebalanceGroups)
