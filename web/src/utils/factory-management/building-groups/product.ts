import { BuildingGroup, Factory, FactoryItem, ItemType } from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'
import {
  calculateBuildingGroupParts,
  createBuildingGroup,
  getGroupOutputMultiplier,
  syncBuildingGroups,
} from '@/utils/factory-management/building-groups/common'
import { getRecipe } from '@/utils/factory-management/common'
import { isExtractionRecipe, isPlainExtraction } from '@/utils/factory-management/building-groups/extraction'
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
    syncBuildingGroups(
      product,
      ItemType.Product,
      factory,
    )

    // Mines and wells start unsynced. Almost nobody actually builds Mk.1 miners, so the first
    // thing done to a new mine is swapping the default for a Mk.3 — and with sync on that writes
    // the group's new output back over the quantity the user just typed. A well is worse: its
    // output comes from satellites, so nothing about the group count describes it. Both are
    // routinely split into groups of differing purity, which sync would flatten.
    //
    // Plain extraction is the exception. A Water Extractor has one mark and no purity, so its
    // groups never need to differ and sync is as useful as it is on any other building.
    if (isExtractionRecipe(product.recipe) && !isPlainExtraction(product.recipe)) {
      product.buildingGroupItemSync = false
    }
  }
  calculateBuildingGroupParts([product], ItemType.Product, factory)
}

// precision defaults to the 3 decimal places quantities are stored at. A caller solving a clock
// from this needs it unrounded: rounding here and again on the clock compounds, and the group then
// under-produces by more than the satisfaction tolerance allows.
export const buildingsNeededForPartsProducts = (
  part: string,
  amount: number,
  product: FactoryItem,
  buildingGroup: BuildingGroup,
  precision = 3
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
    if (!perMinOverclocked || !Number.isFinite(perMinOverclocked)) {
      return 0
    }
    return formatNumberFully(amount / perMinOverclocked, precision)
  }

  if (isProduct && !isIngredient) {
    // This is a product — somersloops amplify output (and for extraction, the group's miner
    // mark and node purity do too), so fewer buildings are needed.
    const outputMultiplier = getGroupOutputMultiplier(
      buildingGroup,
      product.buildingRequirements?.name ?? '',
      product.recipe
    )
    const perMinOverclocked = isProduct.perMin * (buildingGroup.overclockPercent / 100) * outputMultiplier
    // A well with no satellites has a zero multiplier, so no building count reaches the amount.
    // Dividing produced Infinity, which formatNumberFully passes straight through into the plan.
    if (!perMinOverclocked || !Number.isFinite(perMinOverclocked)) {
      return 0
    }
    return formatNumberFully(amount / perMinOverclocked, precision)
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
    syncBuildingGroups(
      product,
      ItemType.Product,
      factory,
    )
  }

  // Since the building count has changed, we need to recalculate the parts for the group so the rest of them remain in sync.
  calculateBuildingGroupParts([product], ItemType.Product, factory)
}
