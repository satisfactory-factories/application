import { BuildingGroup } from '@/interfaces/planner/FactoryInterface'
import { NodePurity, RecipeExtraction } from '@/interfaces/Recipes'
import { getRecipe } from '@/utils/factory-management/common'
import { fetchGameData } from '@/utils/gameDataService'

const gameData = await fetchGameData()

// How much faster a node yields than a normal one. Same figures the parser uses for geothermal.
export const PURITY_MULTIPLIERS: { [purity in NodePurity]: number } = {
  impure: 0.5,
  normal: 1,
  pure: 2,
}

export const PURITY_LABELS: { [purity in NodePurity]: string } = {
  impure: 'Impure',
  normal: 'Normal',
  pure: 'Pure',
}

// getRecipe logs an error for a missing recipe, which is noise for the many non-extraction
// callers, so an empty/unknown recipe short-circuits before it is consulted.
export const getExtraction = (recipeId?: string): RecipeExtraction | undefined => {
  if (!recipeId) {
    return undefined
  }
  return gameData.recipes.find(recipe => recipe.id === recipeId)?.extraction
}

export const isExtractionRecipe = (recipeId?: string): boolean => !!getExtraction(recipeId)

// The extractor a group uses, falling back to the recipe's reference extractor. A building the
// recipe doesn't offer (bad save, changed game data) falls back rather than producing nonsense.
export const getGroupExtractor = (group: BuildingGroup, recipeId?: string): string => {
  const extraction = getExtraction(recipeId)
  if (!extraction) {
    return ''
  }

  const chosen = extraction.extractors.find(e => e.building === group.extractorBuilding)
  return (chosen ?? extraction.extractors[0]).building
}

export const getGroupPurity = (group: BuildingGroup, recipeId?: string): NodePurity => {
  const extraction = getExtraction(recipeId)
  if (!extraction) {
    return 'normal'
  }

  const chosen = group.purity && extraction.purities.includes(group.purity) ? group.purity : undefined
  return chosen ?? (extraction.purities.includes('normal') ? 'normal' : extraction.purities[0])
}

// Writes back the resolved extractor and purity so the group always holds valid values —
// mirrors sanitizeGroupSomersloops. Non-extraction groups are left completely alone.
export const sanitizeGroupExtraction = (group: BuildingGroup, recipeId?: string): void => {
  if (!isExtractionRecipe(recipeId)) {
    return
  }

  const building = getGroupExtractor(group, recipeId)
  const purity = getGroupPurity(group, recipeId)

  if (group.extractorBuilding !== building) {
    group.extractorBuilding = building
  }
  if (group.purity !== purity) {
    group.purity = purity
  }
}

// This group's real output rate per building, at 100% clock.
export const getGroupExtractionRate = (group: BuildingGroup, recipeId?: string): number => {
  const extraction = getExtraction(recipeId)
  if (!extraction) {
    return 0
  }

  const building = getGroupExtractor(group, recipeId)
  const extractor = extraction.extractors.find(e => e.building === building)

  return (extractor?.ratePerMin ?? 0) * PURITY_MULTIPLIERS[getGroupPurity(group, recipeId)]
}

// Output multiplier relative to the recipe's reference rate (first extractor, normal purity).
// This is what lets a group of Mk.3s on pure nodes flow through the existing effective-building
// maths untouched: it simply counts as 8 buildings' worth of the reference extractor.
// Returns 1 for everything that isn't extraction.
export const getExtractionOutputMultiplier = (group: BuildingGroup, recipeId?: string): number => {
  const extraction = getExtraction(recipeId)
  if (!extraction) {
    return 1
  }

  const recipe = getRecipe(recipeId, gameData)
  const referenceRate = recipe?.products[0]?.perMin ?? 0
  if (!referenceRate) {
    return 1
  }

  return getGroupExtractionRate(group, recipeId) / referenceRate
}

// Power draw per building for a group, taken from its own extractor rather than the item's
// single building — a product can mix Mk.2s and Mk.3s. Purity does not affect power.
export const getGroupExtractorPower = (group: BuildingGroup, recipeId?: string): number | undefined => {
  if (!isExtractionRecipe(recipeId)) {
    return undefined
  }

  return gameData.buildings[getGroupExtractor(group, recipeId)]
}
