// Custom buildings: everything the player places that produces nothing — portals, train
// stations, radar towers, lights. They are not products (they run no recipe) and not power
// producers (they consume rather than generate), so they get a pass of their own.
//
// The pass is deliberately thin. A custom building has no recipe to solve, no clock and no
// building groups: its power is `amount x the building's draw`, and its upkeep is `amount x the
// rate per building`. Everything downstream — the factory's power, its building requirements,
// its part demands and therefore its imports — falls out of those two numbers.
import { CustomBuilding, DataInterface } from '@/interfaces/DataInterface'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'

// Custom buildings are drawn with the game's ITEM icons: the building icon set the app ships
// only ever covered production buildings and generators, so a portal or a train station has no
// building image to point at. The keys are the game data's building names, the values the icon
// file under /assets/game/item.
//
// Two are deliberately absent — the Personnel Elevator and the Fluid Truck Station have no icon
// in either set — so they fall back to a glyph rather than a broken image.
const customBuildingIcons: { [key: string]: string } = {
  resourcesink: 'awesome-sink',
  ceilinglight: 'ceiling-light',
  dronestation: 'drone-port',
  floodlightpole: 'flood-light-tower',
  floodlightwall: 'wall-mounted-flood-light',
  jumppadadjustable: 'jump-pad',
  landingpad: 'u-jelly-landing-pad',
  pipehyperstart: 'hypertube-entrance',
  pipelinepump: 'pipeline-pump-mk-1',
  pipelinepumpmk2: 'pipeline-pump-mk-2',
  portal: 'main-portal',
  portalsatellite: 'satellite-portal',
  radartower: 'radar-tower',
  streetlight: 'street-light',
  traindockingstation: 'freight-platform',
  traindockingstationliquid: 'fluid-freight-platform',
  trainstation: 'train-station',
  truckstation: 'truck-station',
}

export const getCustomBuildingIcon = (building: string): string | undefined =>
  customBuildingIcons[building]

export const getCustomBuildingData = (
  building: string,
  gameData: DataInterface,
): CustomBuilding | undefined => {
  if (!building) {
    return undefined
  }

  return gameData.customBuildings?.find(candidate => candidate.name === building)
}

export const getCustomBuildings = (gameData: DataInterface): CustomBuilding[] =>
  gameData.customBuildings ?? []

export const addCustomBuildingToFactory = (
  factory: Factory,
  options: {
    building?: string,
    amount?: number,
  } = {},
) => {
  factory.customBuildings.push({
    // NOSONAR: a display identifier, not a security token.
    id: Math.floor(Math.random() * 10000).toString(), // NOSONAR
    building: options.building ?? '',
    amount: options.amount ?? 1,
    ingredients: [], // Calculated
    powerConsumed: 0, // Calculated
    displayOrder: factory.customBuildings.length,
  })
}

// Rebuilds each custom building's power draw and upkeep from the game data.
//
// Both are derived from `amount` every pass, never edited in place: the count is the only thing
// the user sets, so there is no second source of truth to reconcile. Upkeep is stated for a
// building that is running — a Portal link that is only open half the time is planned by
// halving the number of portals, not by editing the rate behind them.
export const calculateCustomBuildings = (factory: Factory, gameData: DataInterface) => {
  // Plans saved before custom buildings existed have no array at all.
  if (!factory.customBuildings) {
    factory.customBuildings = []
  }

  factory.customBuildings.forEach(customBuilding => {
    const buildingData = getCustomBuildingData(customBuilding.building, gameData)

    if (!buildingData) {
      // Expected while the user is still choosing a building; anything else is stale data.
      if (customBuilding.building) {
        console.warn(`calculateCustomBuildings: Custom building ${customBuilding.building} not found in game data.`)
      }
      customBuilding.powerConsumed = 0
      customBuilding.ingredients = []
      return
    }

    if (customBuilding.amount < 0) {
      customBuilding.amount = 0
    }

    customBuilding.powerConsumed = formatNumberFully(buildingData.power * customBuilding.amount, 3)
    customBuilding.ingredients = buildingData.ingredients.map(ingredient => ({
      part: ingredient.part,
      perMin: formatNumberFully(ingredient.perMin * customBuilding.amount, 3),
    }))
  })
}

// Total draw of every custom building in the factory, for the power pass.
export const getCustomBuildingPower = (factory: Factory): number =>
  (factory.customBuildings ?? []).reduce((total, customBuilding) => total + (customBuilding.powerConsumed ?? 0), 0)

export const deleteCustomBuilding = (index: number, factory: Factory) => {
  factory.customBuildings.splice(index, 1)

  factory.customBuildings.forEach((customBuilding, newIndex) => {
    customBuilding.displayOrder = newIndex
  })
}
