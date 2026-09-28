import { BuildingGroup, Factory, FactoryItem, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { setSinkCount } from '@/utils/factory-management/disposal'

// https://github.com/satisfactory-factories/application/pull/726
//
// The Oil MegaFac's Heavy Oil Residue mix-up, shrunk to one factory. With Sync off, a product's
// Qty/min and its building groups are free to disagree, and every figure in the planner is worked
// out from the Qty. So the plan below balances Heavy Oil Residue exactly, while the refineries
// actually drawn in the groups would leave it 180/min short in game.
//
// Heavy Oil Residue is made two ways, as in the original: its own alternate recipe, and as the
// byproduct of Plastic. Residual Fuel burns all of it, and Fuel-Powered Generators burn the fuel.
//
//   Heavy Oil Residue  Qty 360, groups 2 x 3 refineries    → makes 240, 120 short
//   Residual Fuel      Qty 280, groups 2 x 4 refineries    → makes 320, eats 60 more HOR than planned
//
//   Heavy Oil Residue  planned 0 surplus → -180 shortage as built (both products named on hover)
//   Liquid Fuel        planned 0 surplus → +40 surplus as built
//   Crude Oil          planned 0 surplus → +90 surplus as built (3 fewer refineries drawing it)
//   Polymer Resin      sunk either way, so no as-built chip at all
//
// Both products get the "Groups make N/min" chip and an under or over producing Building Groups
// bar. The Plastic and resin surpluses go to AWESOME Sinks so they are not the story.
export const create726Scenario = (): { getFactories: () => Factory[] } => {
  const oil = newFactory('Oil Refinery (as built)', 0)

  const factories = [oil]

  addProductToFactory(oil, { id: 'LiquidOil', recipe: 'Extract_LiquidOil', amount: 450 })

  // 360 HOR takes 270 crude and drops 180 Polymer Resin.
  addProductToFactory(oil, { id: 'HeavyOilResidue', recipe: 'Alternate_HeavyOilResidue', amount: 360 })

  // 120 Plastic takes the other 180 crude and drops 60 HOR, making 420 HOR in all.
  addProductToFactory(oil, { id: 'Plastic', recipe: 'Plastic', amount: 120 })

  // 280 Liquid Fuel takes exactly the 420 HOR, so the plan reads 0/min surplus on it.
  addProductToFactory(oil, { id: 'LiquidFuel', recipe: 'ResidualFuel', amount: 280 })

  // 14 generators at 20/min each burn every drop.
  addPowerProducerToFactory(oil, {
    building: 'generatorfuel',
    fuelAmount: 280,
    recipe: 'GeneratorFuel_LiquidFuel',
    updated: FactoryPowerChangeType.Fuel,
  })

  setSinkCount(oil, 'Plastic', 1)
  setSinkCount(oil, 'PolymerResin', 1)

  const [, residue, , fuel] = oil.products
  buildGroupsAs(residue, [3, 3]) // 6 refineries: 240/min against the 360 asked for
  buildGroupsAs(fuel, [4, 4]) // 8 refineries: 320/min against the 280 asked for

  return {
    getFactories: () => factories,
  }
}

// Replaces a product's groups with sets of whole refineries at 100%, and turns Sync off so the
// planner leaves them disagreeing with the Qty. Group parts are filled in on load.
const buildGroupsAs = (product: FactoryItem, buildingCounts: number[]) => {
  const template = product.buildingGroups[0]
  product.buildingGroupItemSync = false
  product.buildingGroupsTrayOpen = true
  product.buildingGroups = buildingCounts.map((buildingCount, index): BuildingGroup => ({
    ...template,
    id: template.id + index,
    buildingCount,
    overclockPercent: 100,
    clockSetByUser: false,
    parts: {},
  }))
}
