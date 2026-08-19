/**
 * end-products.ts — which parts the game itself never consumes.
 *
 * A part produced by some recipe that appears as an ingredient of nothing at all is the end of
 * its chain: Space Elevator parts, ammunition, equipment, fireworks. Having no consumer is what
 * those items are FOR, so the planner says "End product" rather than flagging them as surplus
 * nobody asked for.
 *
 * Consumption means every way the game takes an item back: item recipes, power generation
 * recipes, and the Alien Power Augmenter's boost fuel. Miss the last two and the nuclear fuel
 * rods and the Alien Power Matrix all read as end products, which is the opposite of true —
 * they exist to be burned.
 *
 * This is a property of the game data, not of a plan, so it is computed once per data load and
 * stamped onto PartMetrics by parts.ts. That keeps status.ts a leaf with no game data in it.
 */
import { DataInterface } from '@/interfaces/DataInterface'

// Keyed on the game data object rather than built once, matching getHandGatheredParts: this is
// parameterised by gameData, and specs pass their own.
const cache = new WeakMap<DataInterface, Set<string>>()

const compute = (gameData: DataInterface): Set<string> => {
  const consumed = new Set<string>()

  for (const recipe of gameData.recipes) {
    for (const ingredient of recipe.ingredients) consumed.add(ingredient.part)
  }
  for (const recipe of gameData.powerGenerationRecipes) {
    for (const ingredient of recipe.ingredients) consumed.add(ingredient.part)
    if (recipe.boost?.fuelPart) consumed.add(recipe.boost.fuelPart)
  }

  const endProducts = new Set<string>()
  for (const recipe of gameData.recipes) {
    for (const product of recipe.products) {
      // Raw resources are excluded on purpose: an ore nothing happens to consume is a mine with
      // nowhere to send its output, which is the plain "no demand" case rather than an end product.
      if (consumed.has(product.part) || gameData.items.rawResources[product.part]) continue
      endProducts.add(product.part)
    }
  }

  return endProducts
}

export const getEndProducts = (gameData: DataInterface): Set<string> => {
  const cached = cache.get(gameData)
  if (cached) {
    return cached
  }

  const endProducts = compute(gameData)
  cache.set(gameData, endProducts)
  return endProducts
}

export const isEndProductPart = (partId: string, gameData: DataInterface): boolean =>
  !!partId && !!gameData && getEndProducts(gameData).has(partId)
