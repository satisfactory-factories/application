import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'

// A worked example of the extraction features: a mine mixing miner marks and node purities, a
// resource well with its satellite spread, and a factory extracting its own water on site. It
// is deliberately not assuming raw inputs — every raw resource in the plan is dug up by
// something you can see, which is the whole point of it.
export const createMiningDemoPlan = (): TemplatePlan => {
  const ironMine = newFactory('Iron Mine', 0, 1)
  const ironWorks = newFactory('Iron Works', 1, 2)
  const nitrogenWell = newFactory('Nitrogen Well', 2, 3)
  const nitricAcid = newFactory('Nitric Acid', 3, 4)

  const factories = [ironMine, ironWorks, nitrogenWell, nitricAcid]

  const addMining = () => {
    // 2 x Mk.3 on pure nodes (960/min) alongside 1 x Mk.2 on a normal one (120/min).
    addProductToFactory(ironMine, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 1080 })
    const oreProduct = ironMine.products[0]
    const [pureGroup] = oreProduct.buildingGroups
    Object.assign(pureGroup, { extractorBuilding: 'minermk3', purity: 'pure', buildingCount: 2 })
    oreProduct.buildingGroups.push({
      ...pureGroup,
      id: pureGroup.id + 1,
      extractorBuilding: 'minermk2',
      purity: 'normal',
      buildingCount: 1,
      parts: {},
    })

    // One well: 1 normal + 6 pure satellites = 780 m3/min from a single pressurizer.
    addProductToFactory(nitrogenWell, {
      id: 'NitrogenGas',
      recipe: 'Extract_NitrogenGas_Well',
      amount: 780,
    })
    Object.assign(nitrogenWell.products[0].buildingGroups[0], {
      buildingCount: 1,
      satellites: { impure: 0, normal: 1, pure: 6 },
    })

    // Water extracted on site rather than imported — the other half of the feature.
    addProductToFactory(nitricAcid, { id: 'Water', recipe: 'Extract_Water', amount: 30 })
  }

  const addProduction = () => {
    addProductToFactory(ironWorks, { id: 'IronIngot', recipe: 'IngotIron', amount: 1080 })
    addProductToFactory(ironWorks, { id: 'IronPlate', recipe: 'IronPlate', amount: 10 })
    addProductToFactory(nitricAcid, { id: 'NitricAcid', recipe: 'NitricAcid', amount: 30 })
  }

  const addImports = () => {
    addInputToFactory(ironWorks, {
      factoryId: ironMine.id,
      outputPart: 'OreIron',
      amount: 1080,
    })
    addInputToFactory(nitricAcid, {
      factoryId: nitrogenWell.id,
      outputPart: 'NitrogenGas',
      amount: 120,
    })
    addInputToFactory(nitricAcid, {
      factoryId: ironWorks.id,
      outputPart: 'IronPlate',
      amount: 10,
    })
  }

  addMining()
  addProduction()
  addImports()

  return {
    getFactories: () => factories,
    // The plan is all extraction and smelting, so a generation target would only ever
    // read as a permanent deficit.
    powerTarget: 0,
  }
}
