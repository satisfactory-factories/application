import { BuildingGroup, Factory, ItemType } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { PowerRecipe, Recipe } from '@/interfaces/Recipes'
import { toRaw } from 'vue'

// `factory.inputs = factory.inputs.filter(...)` on a reactive factory stores the *proxies*
// filter() read out as the new array's elements. structuredClone — how the calculation
// engine clones the plan — refuses a Proxy, so the next recalculation throws. Wrap any
// array derived from a reactive one before assigning it back.
export const rawArray = <T>(items: T[]): T[] => items.map(item => toRaw(item))

// A fractional overclock the user dialled in themselves (223.333%) is deliberate precision —
// quantities derived from it must be kept exact rather than snapped to the nearest whole
// number. Solver-derived fractional clocks (a typed quantity re-solving to 42 buildings @
// 97.9365%) don't count: they are representations of the typed value, and snapping still applies.
export const hasFractionalClock = (groups: BuildingGroup[] | undefined): boolean => {
  return (groups ?? []).some(group =>
    group.clockSetByUser === true && (group.overclockPercent ?? 100) % 1 !== 0)
}

export const createNewPart = (factory: Factory, part: string) => {
  if (!factory.parts[part]) {
    factory.parts[part] = {
      amountRequired: 0,
      amountRequiredExports: 0,
      amountRequiredProduction: 0,
      amountRequiredPower: 0,
      amountSupplied: 0,
      amountSuppliedViaInput: 0,
      amountSuppliedViaRaw: 0,
      amountSuppliedViaProduction: 0,
      amountRemaining: 0,
      amountRemainingPreSink: 0,
      amountRequiredSink: 0,
      satisfied: true,
      isRaw: false,
      exportable: false,
    }
  }
}

// You may think that this is duplication with the gameDataStore. It kind of is, however, trying to mock the store in tests is a gigantic pain in the arse.
// Therefore, usage of gameDataStore within the ./factory-management files is to be used sparingly, and proxies created here.
export const getRecipe = (recipeId: any, gameData: DataInterface): Recipe | undefined => {
  const recipe = gameData.recipes.find(r => r.id === recipeId)

  if (!recipe) {
    console.error(`Recipe with ID ${recipeId} not found.`)
    return
  }

  return recipe
}

export const getPowerRecipe = (id: string, gameData: DataInterface): PowerRecipe | undefined => {
  if (!gameData || !id) {
    return
  }

  const recipeData = gameData.powerGenerationRecipes.find(recipe => recipe.id === id) ?? undefined

  if (!recipeData) {
    return undefined // JSON.parse would otherwise crash on "undefined"
  }

  // Create a structured clone of the recipe so no changes are made to the original data
  return JSON.parse(JSON.stringify(recipeData))
}

export const getPartDisplayNameWithoutDataStore = (part: string, gameData: DataInterface): string => {
  if (!part) {
    return 'NO PART!!!'
  }
  if (!gameData) {
    console.error('getPartDisplayName: No game data!!')
    return 'NO DATA!!!'
  }
  return gameData.items.rawResources[part]?.name ||
    gameData.items.parts[part]?.name ||
    `UNKNOWN PART ${part}!`
}

// Buildings without Power Shard slots — their clock is locked at 100%.
const NON_OVERCLOCKABLE_BUILDINGS = new Set(['geothermalgenerator', 'alienpoweraugmenter'])

export const canBuildingOverclock = (building: string): boolean => {
  return !NON_OVERCLOCKABLE_BUILDINGS.has(building)
}

// Buildings whose building groups are always kept in sync with the item: with no clocks
// or fuel to fine-tune, unsynced groups offer nothing but confusion (Alien Power
// Augmenter groups exist only to split fueled from unfueled buildings).
const ALWAYS_SYNCED_BUILDINGS = new Set(['geothermalgenerator', 'alienpoweraugmenter'])

export const isAlwaysSyncedBuilding = (building: string): boolean => {
  return ALWAYS_SYNCED_BUILDINGS.has(building)
}

// A power producer is named by its building, but a freshly added one has no building until the
// user picks it — every view that lists producers hits that half-configured state, so the fallback
// belongs here rather than in each of them.
export const getPowerProducerDisplayName = (producer: { building: string }): string =>
  producer.building ? getBuildingDisplayName(producer.building) : 'Power Generator'

export const getBuildingDisplayName = (building: string) => {
  const buildingFriendly = new Map<string, string>([
    ['assemblermk1', 'Assembler'],
    ['blender', 'Blender'],
    ['constructormk1', 'Constructor'],
    ['frackingextractor', 'Resource Well Extractor'],
    ['frackingsmasher', 'Resource Well Pressurizer'],
    ['converter', 'Converter'],
    ['foundrymk1', 'Foundry'],
    ['hadroncollider', 'Particle Accelerator'],
    ['alienpoweraugmenter', 'Alien Power Augmenter'],
    ['generatorbiomass', 'Biomass Burner'],
    ['generatorcoal', 'Coal-Powered Generator'],
    ['generatorfuel', 'Fuel-Powered Generator'],
    ['geothermalgenerator', 'Geothermal Generator'],
    ['generatornuclear', 'Nuclear Power Plant'],
    ['manufacturermk1', 'Manufacturer'],
    ['minermk1', 'Miner Mk.1'],
    ['minermk2', 'Miner Mk.2'],
    ['minermk3', 'Miner Mk.3'],
    ['oilpump', 'Oil Extractor'],
    ['oilrefinery', 'Oil Refinery'],
    ['packager', 'Packager'],
    ['quantumencoder', 'Quantum Encoder'],
    ['smeltermk1', 'Smelter'],
    ['waterpump', 'Water Extractor'],
    // Logistics. Keyed by icon slug rather than by the game's internal name like the entries
    // above: these only ever reach here from the export calculator, which names them by icon.
    ['conveyor-belt-mk-1', 'Conveyor Belt Mk.1'],
    ['conveyor-belt-mk-2', 'Conveyor Belt Mk.2'],
    ['conveyor-belt-mk-3', 'Conveyor Belt Mk.3'],
    ['conveyor-belt-mk-4', 'Conveyor Belt Mk.4'],
    ['conveyor-belt-mk-5', 'Conveyor Belt Mk.5'],
    ['conveyor-belt-mk-6', 'Conveyor Belt Mk.6'],
    ['pipeline-mk-1', 'Pipeline Mk.1'],
    ['pipeline-mk-2', 'Pipeline Mk.2'],
  ])

  return buildingFriendly.get(building) ?? `UNKNOWN BUILDING: ${building}`
}

export const deleteItem = (index: number, type: ItemType, factory: Factory) => {
  if (type === ItemType.Product) {
    factory.products.splice(index, 1)

    // We need to loop through each one in order and fix their ordering with the running count
    factory.products.forEach((product, index) => {
      product.displayOrder = index
    })
  } else if (type === ItemType.Power) {
    factory.powerProducers.splice(index, 1)

    // We need to loop through each one in order and fix their ordering with the running count
    factory.powerProducers.forEach((producer, index) => {
      producer.displayOrder = index
    })
  }

  // Must call updateFactory!
}
