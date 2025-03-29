import { BuildingGroup, Factory, FactoryItem, ItemType } from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'
import {
  calculateBuildingGroupParts,
  createBuildingGroup,
  rebalanceBuildingGroups,
} from '@/utils/factory-management/building-groups/common'
import { getRecipe } from '@/utils/factory-management/common'
import { fetchGameData } from '@/utils/gameDataService'

const gameData = await fetchGameData()

export const addProductBuildingGroup = (
  product: FactoryItem,
  factory: Factory,
  matchBuildings = false
) => {
  createBuildingGroup(product, ItemType.Product, matchBuildings)

  // There's a high probability that a fractional building count has been created, so we need to run the balancing to make it whole buildings and underclocked.
  // Only do this though if we have one building group, as we don't want to mess with the overclocking if we have multiple groups.
  if (matchBuildings) {
    rebalanceBuildingGroups(
      product,
      ItemType.Product,
      factory,
    )
  }
  calculateBuildingGroupParts([product], ItemType.Product, factory)
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
  factory: Factory,
  part: string
) => {
  if (buildingGroup.type !== ItemType.Product) {
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
    rebalanceBuildingGroups(
      product,
      ItemType.Product,
      factory,
    )
  }

  // Since the building count has changed, we need to recalculate the parts for the group so the rest of them remain in sync.
  calculateBuildingGroupParts([product], ItemType.Product, factory)
}
