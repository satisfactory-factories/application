// End-to-end cover for the two ways a plan can source its ore now that extraction is modelled:
// a dedicated mine factory exporting raw ore, and a factory that mines and smelts on site.
// Both exist to prove the raw-resource accounting doesn't quietly assume supply that the
// mining is meant to be providing.

import { beforeEach, describe, expect, it } from 'vitest'
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
      mine.assumeRawInputs = false
      mine.products[0].buildingGroups[0].buildingCount = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      expect(mine.products[0].amount).toBe(240)
      expect(mine.parts.OreIron.amountSuppliedViaRaw).toBe(0)
      expect(mine.parts.OreIron.satisfied).toBe(false)
      expect(mine.hasProblem).toBe(true)
    })

    it('still assumes the missing ore while the assumption is left on', () => {
      mine.products[0].buildingGroups[0].buildingCount = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      expect(mine.parts.OreIron.amountSuppliedViaRaw).toBe(720)
      expect(mine.parts.OreIron.satisfied).toBe(true)
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
})
