import { BuildingGroup } from '@/interfaces/planner/FactoryInterface'
import { NodePurity, RecipeExtraction, RecipeWell } from '@/interfaces/Recipes'
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

// The well behind a recipe, if it is one. Wells are extraction, but their output comes from
// satellite nodes rather than from the (powered) building the group counts.
export const getWell = (recipeId?: string): RecipeWell | undefined => getExtraction(recipeId)?.well

export const isWellRecipe = (recipeId?: string): boolean => !!getWell(recipeId)

// A well with no satellites produces nothing and reads as broken, so a new one starts on a
// single normal node.
export const DEFAULT_SATELLITES: { [purity in NodePurity]: number } = { impure: 0, normal: 1, pure: 0 }

export const getGroupSatellites = (group: BuildingGroup): { [purity in NodePurity]: number } => {
  const satellites = group.satellites ?? DEFAULT_SATELLITES
  const clamp = (value: number) => Math.max(0, Math.round(Number.isFinite(value) ? value : 0))

  return {
    impure: clamp(satellites.impure ?? 0),
    normal: clamp(satellites.normal ?? 0),
    pure: clamp(satellites.pure ?? 0),
  }
}

// Satellite extractors this group needs built, across all its wells.
export const getGroupSatelliteCount = (group: BuildingGroup, recipeId?: string): number => {
  if (!isWellRecipe(recipeId)) {
    return 0
  }
  const satellites = getGroupSatellites(group)

  return (satellites.impure + satellites.normal + satellites.pure) * group.buildingCount
}

// The recipe that extracts a raw resource, if one exists. Collectables (Leaves, alien remains,
// power slugs) and resource-well gases have none, so callers must handle undefined.
// Prefers a plain extractor over a resource well: a well needs its satellites describing before
// it means anything, so it is a poor thing to drop on someone from a one-click button.
export const getExtractionRecipeForPart = (part: string): string | undefined => {
  const candidates = gameData.recipes.filter(recipe => recipe.extraction && recipe.products[0]?.part === part)

  return (candidates.find(recipe => !recipe.extraction?.well) ?? candidates[0])?.id
}

// The rate one reference extractor yields at 100% on a normal node. Effective building counts
// are expressed in these units, so multiplying by it converts them back into items/min.
export const getExtractionReferenceRate = (recipeId?: string): number => {
  if (!isExtractionRecipe(recipeId)) {
    return 0
  }
  return gameData.recipes.find(recipe => recipe.id === recipeId)?.products[0]?.perMin ?? 0
}

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
  // Wells declare no purities — theirs sit on the satellites — so they fall back to normal,
  // which leaves the group's own purity multiplier at 1.
  if (!extraction || extraction.purities.length === 0) {
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

  if (isWellRecipe(recipeId)) {
    const satellites = getGroupSatellites(group)
    const current = group.satellites
    if (!current || current.impure !== satellites.impure ||
      current.normal !== satellites.normal || current.pure !== satellites.pure) {
      group.satellites = satellites
    }
  } else if (group.satellites) {
    delete group.satellites
  }
}

// This group's real output rate per building, at 100% clock.
export const getGroupExtractionRate = (group: BuildingGroup, recipeId?: string): number => {
  const extraction = getExtraction(recipeId)
  if (!extraction) {
    return 0
  }

  // A well's rate is the sum of its satellites, not a single extractor's rate x purity.
  if (extraction.well) {
    const satellites = getGroupSatellites(group)
    const rates = extraction.well.satelliteRates

    return (satellites.impure * rates.impure) +
      (satellites.normal * rates.normal) +
      (satellites.pure * rates.pure)
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
