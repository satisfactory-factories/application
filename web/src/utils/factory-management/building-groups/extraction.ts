import { BuildingGroup } from '@/interfaces/planner/FactoryInterface'
import { NodePurity, RecipeExtraction, RecipeWell } from '@/interfaces/Recipes'
import { getRecipe } from '@/utils/factory-management/common'
import { fetchGameData } from '@/utils/gameDataService'
import { formatNumberFully } from '@/utils/numberFormatter'

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

// Extraction that behaves like any other producing building: one extractor, one purity, no
// satellites. Its building count is the whole story — one building is one Water Extractor at a
// flat rate — where a mine's count is in reference-extractor units and says nothing on its own.
// Water is the only resource shaped this way today, and it takes the ordinary building UI.
export const isPlainExtraction = (recipeId?: string): boolean => {
  const extraction = getExtraction(recipeId)
  if (!extraction || extraction.well) {
    return false
  }
  return extraction.extractors.length === 1 && extraction.purities.length <= 1
}

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

// The recipe that extracts a raw resource with a plain extractor, if one exists. Collectables
// (Leaves, alien remains, power slugs) and resource-well gases have none, so callers must handle
// undefined.
//
// Wells are deliberately excluded rather than used as a fallback. A well's rate comes from its
// satellite field, and a fresh group carries one normal satellite — so solving a target rate
// against it multiplies the pressurizer instead, turning 600 m³/min into ten 150 MW pressurizers
// where one would do. That reads as a solved plan while being an order of magnitude out, so a
// well has to be placed deliberately and its satellites described.
export const getExtractionRecipeForPart = (part: string): string | undefined =>
  gameData.recipes.find(recipe =>
    recipe.extraction && !recipe.extraction.well && recipe.products[0]?.part === part
  )?.id

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

// Purity to add satellites on when a well has to grow: whichever it already has most of, so a
// well built on pure nodes stays on pure nodes. A fresh group carries one normal satellite.
const primarySatellitePurity = (satellites: { [purity in NodePurity]: number }): NodePurity =>
  (['normal', 'pure', 'impure'] as NodePurity[])
    .reduce((best, purity) => satellites[purity] > satellites[best] ? purity : best, 'normal')

// The game's clock cap. Held here rather than imported from building-groups/common, which imports
// this file.
const MAX_WELL_CLOCK = 250

// A well whose satellites say something about the map. A fresh group carries exactly one normal
// satellite, so anything else is a layout somebody described — either the user, from the nodes
// they actually have, or the solver on their behalf.
export const isWellDescribed = (group: BuildingGroup): boolean => {
  const satellites = getGroupSatellites(group)

  return satellites.impure !== DEFAULT_SATELLITES.impure ||
    satellites.normal !== DEFAULT_SATELLITES.normal ||
    satellites.pure !== DEFAULT_SATELLITES.pure
}

/**
 * Solves a well group to a target, in reference-extractor units.
 *
 * One pressurizer serves every satellite on the node, so on a well the knob is satellites rather
 * than buildings. Solved like an ordinary building it multiplied the pressurizer instead:
 * switching 360/min of Water onto a well gave six 150 MW pressurizers with a satellite each,
 * where one pressurizer with six satellites does it — the same water for a sixth of the power.
 *
 * But satellite nodes are fixed map features, and demand does not create them. So the satellites
 * are only solved for a well that has none described yet; once a layout exists the pressurizer's
 * clock is the only thing that moves over it, and a target it cannot reach is left short for the
 * mismatch chip to report rather than met by inventing nodes that are not on the map.
 *
 * Returns false for anything that is not a well, so callers can fall through to the normal path.
 */
export const solveWellGroup = (group: BuildingGroup, targetBuildings: number, recipeId?: string): boolean => {
  const well = getWell(recipeId)
  const referenceRate = getExtractionReferenceRate(recipeId)
  if (!well || !referenceRate) {
    return false
  }

  const targetRateForLayout = Math.max(0, targetBuildings) * referenceRate

  if (isWellDescribed(group)) {
    const buildingCount = Math.max(1, group.buildingCount || 1)
    const layoutRate = getGroupExtractionRate(group, recipeId)
    if (!layoutRate) {
      return false
    }

    group.buildingCount = buildingCount
    group.overclockPercent = Math.min(
      MAX_WELL_CLOCK,
      formatNumberFully((targetRateForLayout / (buildingCount * layoutRate)) * 100, 4)
    )
    group.clockSetByUser = false

    return true
  }

  const satellites = getGroupSatellites(group)
  const purity = primarySatellitePurity(satellites)
  const ratePerSatellite = well.satelliteRates[purity]
  if (!ratePerSatellite) {
    return false
  }

  // Satellites of the other purities are already on the node and stay there; the primary one
  // makes up the difference.
  const otherRate = (['impure', 'normal', 'pure'] as NodePurity[])
    .reduce((sum, other) => other === purity ? sum : sum + satellites[other] * well.satelliteRates[other], 0)

  const targetRate = targetRateForLayout

  // Round the satellites up and underclock the pressurizer to land exactly, the same bargain the
  // ordinary solver strikes with buildings — and the one that costs no power shards.
  satellites[purity] = Math.max(1, Math.ceil((targetRate - otherRate) / ratePerSatellite))
  const achievedRate = otherRate + satellites[purity] * ratePerSatellite

  group.satellites = satellites
  group.buildingCount = 1
  group.overclockPercent = achievedRate > 0 ? formatNumberFully((targetRate / achievedRate) * 100, 4) : 0
  group.clockSetByUser = false

  return true
}

// Power draw per building for a group, taken from its own extractor rather than the item's
// single building — a product can mix Mk.2s and Mk.3s. Purity does not affect power.
export const getGroupExtractorPower = (group: BuildingGroup, recipeId?: string): number | undefined => {
  if (!isExtractionRecipe(recipeId)) {
    return undefined
  }

  return gameData.buildings[getGroupExtractor(group, recipeId)]
}
