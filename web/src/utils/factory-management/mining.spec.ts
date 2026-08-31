// End-to-end cover for the two ways a plan can source its ore now that extraction is modelled:
// a dedicated mine factory exporting raw ore, and a factory that mines and smelts on site.
// Both exist to prove the raw-resource accounting doesn't quietly assume supply that the
// mining is meant to be providing.

import { beforeEach, describe, expect, it } from 'vitest'
import { reactive, watch } from 'vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { fetchGameData } from '@/utils/gameDataService'

describe('mining scenarios', async () => {
  const gameData = await fetchGameData()

  describe('a dedicated mine factory exporting raw ore', () => {
    let mine: Factory
    let smelter: Factory
    let factories: Factory[]

    beforeEach(() => {
      mine = newFactory('Iron Mine', 0, 1)
      smelter = newFactory('Iron Smelter', 1, 2)
      factories = [mine, smelter]

      // 4 x Mk.2 on pure nodes = 960/min
      addProductToFactory(mine, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 960 })
      mine.products[0].buildingGroups[0].extractorBuilding = 'minermk2'
      mine.products[0].buildingGroups[0].purity = 'pure'
      mine.products[0].buildingGroups[0].buildingCount = 4

      addProductToFactory(smelter, { id: 'IronIngot', recipe: 'IngotIron', amount: 960 })
      addInputToFactory(smelter, { factoryId: mine.id, outputPart: 'OreIron', amount: 960 })

      // Mines default to unsynced so swapping the miner mark doesn't rewrite the quantity;
      // these cases adjust the miners and expect the plan to follow, so opt back in.
      mine.products[0].buildingGroupItemSync = true

      calculateFactories(factories, gameData, { origin: 'buildingGroup' })
    })

    it('produces the ore from the miners rather than assuming it', () => {
      expect(mine.products[0].amount).toBe(960)
      expect(mine.parts.OreIron.amountSuppliedViaProduction).toBe(960)
      expect(mine.parts.OreIron.amountSuppliedViaRaw).toBe(0)
      expect(mine.buildingRequirements.minermk2.amount).toBe(4)
    })

    it('satisfies the smelter from the import, with no raw top-up', () => {
      expect(smelter.parts.OreIron.amountSuppliedViaInput).toBe(960)
      expect(smelter.parts.OreIron.amountSuppliedViaRaw).toBe(0)
      expect(smelter.parts.OreIron.satisfied).toBe(true)
      expect(smelter.requirementsSatisfied).toBe(true)
    })

    it('leaves both factories problem-free and the mine exporting', () => {
      expect(mine.parts.OreIron.exportable).toBe(true)
      expect(mine.hasProblem).toBe(false)
      expect(smelter.hasProblem).toBe(false)
    })

    it('flags the mine when its miners cannot cover what is exported', () => {
      // Drop to a single Mk.2 on a pure node: 240/min against a 960/min export request.
      // The mine must not quietly assume the missing 720/min — that is the whole point of
      // having modelled the miners.
      mine.products[0].buildingGroups[0].buildingCount = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      expect(mine.products[0].amount).toBe(240)
      expect(mine.parts.OreIron.amountSuppliedViaRaw).toBe(0)
      expect(mine.parts.OreIron.satisfied).toBe(false)
      expect(mine.hasProblem).toBe(true)
    })
  })

  describe('mining and smelting on site', () => {
    let factory: Factory

    beforeEach(() => {
      factory = newFactory('Iron Works', 0, 1)

      addProductToFactory(factory, { id: 'IronIngot', recipe: 'IngotIron', amount: 480 })
      // 2 x Mk.2 on pure nodes = 480/min, exactly feeding the smelters.
      addProductToFactory(factory, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 480 })
      const group = factory.products[1].buildingGroups[0]
      group.extractorBuilding = 'minermk2'
      group.purity = 'pure'
      group.buildingCount = 2

      calculateFactories([factory], gameData, { origin: 'buildingGroup' })
    })

    it('feeds the smelters from its own miners without assuming raw supply', () => {
      expect(factory.parts.OreIron.amountRequiredProduction).toBe(480)
      expect(factory.parts.OreIron.amountSuppliedViaProduction).toBe(480)
      expect(factory.parts.OreIron.amountSuppliedViaRaw).toBe(0)
      expect(factory.parts.OreIron.satisfied).toBe(true)
    })

    it('builds both the miners and the smelters', () => {
      expect(factory.buildingRequirements.minermk2.amount).toBe(2)
      expect(factory.buildingRequirements.smeltermk1.amount).toBe(16)
      // 2 x Mk.2 miners (15 MW) + 16 smelters (4 MW)
      expect(factory.power.consumed).toBe(94)
    })

    it('keeps the ingots exportable and the ore internal', () => {
      expect(factory.parts.IronIngot.exportable).toBe(true)
      expect(factory.parts.OreIron.amountRemaining).toBe(0)
      expect(factory.requirementsSatisfied).toBe(true)
      expect(factory.hasProblem).toBe(false)
    })
  })

  describe('a resource well feeding another factory', () => {
    let well: Factory
    let refinery: Factory
    let factories: Factory[]

    beforeEach(() => {
      well = newFactory('Nitrogen Well', 0, 1)
      refinery = newFactory('Nitric Acid', 1, 2)
      factories = [well, refinery]

      addProductToFactory(well, { id: 'NitrogenGas', recipe: 'Extract_NitrogenGas_Well', amount: 60 })
      const group = well.products[0].buildingGroups[0]
      group.buildingCount = 1
      group.satellites = { impure: 0, normal: 1, pure: 6 } // 780/min
      well.products[0].buildingGroupItemSync = true

      // 30/min of Nitric Acid needs exactly 120/min of nitrogen.
      addProductToFactory(refinery, { id: 'NitricAcid', recipe: 'NitricAcid', amount: 30 })
      addInputToFactory(refinery, { factoryId: well.id, outputPart: 'NitrogenGas', amount: 120 })

      calculateFactories(factories, gameData, { origin: 'buildingGroup' })
    })

    it('exports its gas like any other product', () => {
      expect(well.products[0].amount).toBe(780)
      expect(well.parts.NitrogenGas.exportable).toBe(true)
      expect(well.dependencies.metrics.NitrogenGas.isRequestSatisfied).toBe(true)
    })

    it('satisfies the consumer without assuming any raw gas', () => {
      expect(refinery.parts.NitrogenGas.amountSuppliedViaInput).toBe(120)
      expect(refinery.parts.NitrogenGas.amountSuppliedViaRaw).toBe(0)
      expect(refinery.parts.NitrogenGas.satisfied).toBe(true)
    })

    it('builds the pressurizer and its satellites', () => {
      expect(well.buildingRequirements.frackingsmasher.amount).toBe(1)
      expect(well.buildingRequirements.frackingextractor.amount).toBe(7)
      expect(well.power.consumed).toBe(150)
    })
  })

  describe('oil extraction on purity', () => {
    it('runs an oil extractor on a pure node end to end', () => {
      const factory = newFactory('Oil Field')
      addProductToFactory(factory, { id: 'LiquidOil', recipe: 'Extract_LiquidOil', amount: 120 })
      const group = factory.products[0].buildingGroups[0]
      group.purity = 'pure'
      group.buildingCount = 2
      factory.products[0].buildingGroupItemSync = true

      calculateFactories([factory], gameData, { origin: 'buildingGroup' })

      // 2 oil extractors on pure nodes: 2 x 240
      expect(factory.products[0].amount).toBe(480)
      expect(factory.buildingRequirements.oilpump.amount).toBe(2)
      expect(factory.power.consumed).toBe(80)
    })
  })

  // The planner's central perf property: a recalculation that changes nothing must write
  // nothing. Extraction sanitizes its groups on every pass, so it is well placed to break it.
  describe('recalculation stays idempotent with extraction in the plan', () => {
    const buildPlan = (): Factory[] => {
      const mine = newFactory('Iron Mine', 0, 1)
      addProductToFactory(mine, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 480 })
      Object.assign(mine.products[0].buildingGroups[0], {
        extractorBuilding: 'minermk3',
        purity: 'pure',
        buildingCount: 1,
      })

      const wellFactory = newFactory('Water Well', 1, 2)
      addProductToFactory(wellFactory, { id: 'Water', recipe: 'Extract_Water_Well', amount: 60 })
      Object.assign(wellFactory.products[0].buildingGroups[0], {
        satellites: { impure: 1, normal: 2, pure: 3 },
        buildingCount: 1,
      })

      const smelter = newFactory('Iron Smelter', 2, 3)
      addProductToFactory(smelter, { id: 'IronIngot', recipe: 'IngotIron', amount: 480 })
      addInputToFactory(smelter, { factoryId: mine.id, outputPart: 'OreIron', amount: 480 })

      return [mine, wellFactory, smelter]
    }

    it('performs zero reactive writes on a no-op recalculation', () => {
      const state = reactive({ factories: buildPlan() })
      calculateFactories(state.factories, gameData)
      // Twice: the first run settles the groups, the second must be a genuine no-op.
      calculateFactories(state.factories, gameData)

      let fires = 0
      watch(() => state, () => { fires++ }, { deep: true, flush: 'sync' })

      calculateFactories(state.factories, gameData)

      expect(fires).toBe(0)
    })

    it('survives a save/load round trip with its extraction settings intact', () => {
      const factories = buildPlan()
      calculateFactories(factories, gameData)

      const reloaded: Factory[] = JSON.parse(JSON.stringify(factories))
      calculateFactories(reloaded, gameData, { origin: 'recalculate' })

      const mineGroup = reloaded[0].products[0].buildingGroups[0]
      expect(mineGroup.extractorBuilding).toBe('minermk3')
      expect(mineGroup.purity).toBe('pure')
      expect(reloaded[0].products[0].amount).toBe(factories[0].products[0].amount)

      const wellGroup = reloaded[1].products[0].buildingGroups[0]
      expect(wellGroup.satellites).toEqual({ impure: 1, normal: 2, pure: 3 })
      expect(reloaded[1].products[0].amount).toBe(factories[1].products[0].amount)
    })

    it('treats extraction groups as sacrosanct on a Recalculate', () => {
      const factories = buildPlan()
      calculateFactories(factories, gameData)
      const before = JSON.parse(JSON.stringify(factories[0].products[0].buildingGroups))

      calculateFactories(factories, gameData, { origin: 'recalculate' })

      expect(factories[0].products[0].buildingGroups).toEqual(before)
    })
  })
})
