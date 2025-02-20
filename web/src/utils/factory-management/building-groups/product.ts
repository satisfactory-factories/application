import { BuildingGroup, FactoryItem, GroupType } from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'
import { addBuildingGroup, rebalanceBuildingGroups } from '@/utils/factory-management/building-groups/common'
import { getRecipe } from '@/utils/factory-management/common'
import { fetchGameData } from '@/utils/gameDataService'

const gameData = await fetchGameData()

export const addProductBuildingGroup = (product: FactoryItem, addBuildings = true) => {
  addBuildingGroup(product, GroupType.Product, addBuildings)

  // There's a high probability that a fractional building count has been created, so we need to run the balancing to make it whole buildings and underclocked.
  // Only do this though if we have one building group, as we don't want to mess with the overclocking if we have multiple groups.
  if (product.buildingGroups.length === 1 && addBuildings) {
    rebalanceBuildingGroups(
      product,
      GroupType.Product,
      { force: true, changeBuildings: true }
    )
  }
  calculateProductBuildingGroupParts([product])
}

// Calculates all parts for a product based on the building groups
export const calculateProductBuildingGroupParts = (products: FactoryItem[], exclude?: string) => {
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
      addProductBuildingGroup(product, true)
    }

    const totalBuildingCount = product.buildingRequirements.amount

    for (const group of product.buildingGroups) {
      for (const part in product.requirements) {
        if (part === exclude) {
          continue // Skip this part so we don't cause an update storm.
        }
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
        group.parts[part] = formatNumberFully(group.parts[part] * overclockMulti)
      }
    }
  }
}

export const buildingsNeededForPartsProducts = (
  part: string,
  amount: number,
  product: FactoryItem,
  buildingGroup: BuildingGroup
) => {
  // Get the recipe for the product in order to get the new quantity
  const recipe = getRecipe(product.recipe, gameData)

  if (!recipe) {
    throw new Error('buildingGroupProducts: buildingsNeededForPartsProducts: Recipe not found!')
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

export const updateProductBuildingGroupParts = (
  buildingGroup: BuildingGroup,
  product: FactoryItem,
  part: string
) => {
  if (buildingGroup.type !== GroupType.Product) {
    throw new Error('buildingGroupProducts: updateProductBuildingGroupParts: Group is not a product group!')
  }
  // Loop each of the parts, calculating each one. If the calculated size of the building has changed, we update the building group, and if it's a singular building group, the product's building requirements as well.
  const partAmount = buildingGroup.parts[part]
  const newBuildingCount = buildingsNeededForPartsProducts(part, partAmount, product, buildingGroup)

  // If the new building count is different, update the building group's building count
  buildingGroup.buildingCount = Math.ceil(newBuildingCount)

  // If this is the only building group, update the product's building requirements as well, and call a rebalance so it deals with the overclocking for us
  if (product.buildingGroups.length === 1) {
    product.buildingRequirements.amount = newBuildingCount // With this one we don't care about overclocking.
    rebalanceBuildingGroups(product, GroupType.Product, { force: true, changeBuildings: false })
  }

  // Since the building count has changed, we need to recalculate the parts for the group so the rest of them remain in sync.
  calculateProductBuildingGroupParts([product], part)
}
