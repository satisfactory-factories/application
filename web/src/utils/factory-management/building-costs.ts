// The material cost report behind Power & Buildings' "Material Costs" panel (#477): what it
// would cost, in parts, to physically build everything `buildingRequirements` counts —
// production buildings, power generators, extractors and custom buildings alike. Deliberately
// thin, like custom-buildings.ts: no clock, no groups, just `game data cost x final building
// count` per building, summed by part.
import { BuildingCostIngredient, DataInterface } from '@/interfaces/DataInterface'
import { BuildingMaterialCost, Factory } from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'

export const getBuildingCost = (building: string, gameData: DataInterface): BuildingCostIngredient[] =>
  gameData.buildingCosts?.[building] ?? []

// Must run after calculateFinalBuildingsAndPower, which is what finalizes
// factory.buildingRequirements' amounts — everything here is derived from those counts.
export const calculateBuildingMaterialCosts = (factory: Factory, gameData: DataInterface) => {
  const costs: { [part: string]: BuildingMaterialCost } = {}

  Object.values(factory.buildingRequirements).forEach(buildingData => {
    if (!buildingData.amount) {
      return
    }

    getBuildingCost(buildingData.name, gameData).forEach(ingredient => {
      if (!costs[ingredient.part]) {
        costs[ingredient.part] = { amount: 0, buildings: {} }
      }

      const entry = costs[ingredient.part]
      entry.amount = formatNumberFully(entry.amount + (ingredient.amount * buildingData.amount), 3)
      // Every unit of this building needs the same cost, so the "used in" figure is simply the
      // building's own count — not the ingredient amount re-multiplied by anything.
      entry.buildings[buildingData.name] = buildingData.amount
    })
  })

  factory.buildingMaterialCosts = costs
}
