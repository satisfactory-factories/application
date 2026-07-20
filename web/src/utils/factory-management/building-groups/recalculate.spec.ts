// Building groups are SACROSANCT during recalculation: the user may have spent a lot of
// time crafting exact building counts, clocks, somersloops and matrix toggles. A
// recalculation (the Recalculate action, plan loading) must NEVER adjust them — item
// quantities are adjusted to match the groups instead.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  Factory,
  FactoryPowerChangeType,
  FactoryPowerProducer,
} from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'
import { gameData } from '@/utils/gameData'

describe('recalculation preserves building groups', () => {
  let factory: Factory

  describe('products', () => {
    beforeEach(() => {
      factory = newFactory('Rod factory')
      // 1 constructor @ 250% produces 37.5 iron rods/min (15/min per 100% building).
      addProductToFactory(factory, { id: 'IronRod', amount: 37.5, recipe: 'IronRod' })
      calculateFactories([factory], gameData)

      const group = factory.products[0].buildingGroups[0]
      group.buildingCount = 1
      group.overclockPercent = 250
      calculateFactories([factory], gameData)
    })

    it('should not touch an in-sync custom group on repeated plain recalculations', () => {
      calculateFactories([factory], gameData)
      calculateFactories([factory], gameData)

      const group = factory.products[0].buildingGroups[0]
      expect(group.buildingCount).toBe(1)
      expect(group.overclockPercent).toBe(250)
      expect(factory.products[0].amount).toBe(37.5)
    })

    it('should never rebalance groups on a recalculation, adjusting the quantity instead', () => {
      // Simulate the item diverging from the groups (e.g. after a data version change).
      factory.products[0].amount = 150

      calculateFactories([factory], gameData, { origin: 'recalculate' })

      const group = factory.products[0].buildingGroups[0]
      expect(group.buildingCount).toBe(1)
      expect(group.overclockPercent).toBe(250)
      // The quantity followed the groups, not the other way around.
      expect(factory.products[0].amount).toBe(37.5)
    })

    it('should preserve somersloops through a recalculation', () => {
      const group = factory.products[0].buildingGroups[0]
      group.somersloops = 1 // Constructors have 1 slot
      factory.products[0].amount = 999

      calculateFactories([factory], gameData, { origin: 'recalculate' })

      expect(group.buildingCount).toBe(1)
      expect(group.overclockPercent).toBe(250)
      expect(group.somersloops).toBe(1)
    })

    it('should still rebalance groups when the user edits the product quantity', () => {
      // A regular (non-recalculate) calculation with a diverged amount is the sync
      // feature doing its job: the item wins and the groups follow.
      factory.products[0].amount = 60 // 4 effective buildings

      calculateFactories([factory], gameData)

      const group = factory.products[0].buildingGroups[0]
      expect(group.buildingCount).toBe(4)
      expect(group.overclockPercent).toBe(100)
      expect(factory.products[0].amount).toBe(60)
    })

    it('should leave sync-disabled groups and quantities alone, flagging the problem', () => {
      const product = factory.products[0]
      product.buildingGroupItemSync = false
      product.amount = 150

      calculateFactories([factory], gameData, { origin: 'recalculate' })

      const group = product.buildingGroups[0]
      expect(group.buildingCount).toBe(1)
      expect(group.overclockPercent).toBe(250)
      expect(product.amount).toBe(150)
      expect(product.buildingGroupsHaveProblem).toBe(true)
    })
  })

  describe('power producers', () => {
    let producer: FactoryPowerProducer

    beforeEach(() => {
      factory = newFactory('Power station')
      addPowerProducerToFactory(factory, {
        building: 'alienpoweraugmenter',
        buildingAmount: 2,
        recipe: 'AlienPowerAugmenter',
        updated: FactoryPowerChangeType.Building,
      })
      producer = factory.powerProducers[0]
      calculateFactories([factory], gameData)

      // Split into two groups of one building; one injected with matrixes.
      producer.buildingGroups[0].buildingCount = 1
      addPowerProducerBuildingGroup(producer, factory, false)
      producer.buildingGroups[1].buildingCount = 1
      producer.buildingGroups[1].supplyMatrixes = true
      calculateFactories([factory], gameData)
    })

    it('should preserve producer groups and matrix toggles through a recalculation', () => {
      producer.buildingAmount = 10 // Diverge the producer from its groups

      calculateFactories([factory], gameData, { origin: 'recalculate' })

      expect(producer.buildingGroups).toHaveLength(2)
      expect(producer.buildingGroups[0].buildingCount).toBe(1)
      expect(producer.buildingGroups[0].supplyMatrixes ?? false).toBe(false)
      expect(producer.buildingGroups[1].buildingCount).toBe(1)
      expect(producer.buildingGroups[1].supplyMatrixes).toBe(true)
      // The producer quantity followed the groups.
      expect(producer.buildingAmount).toBe(2)
      expect(producer.powerProduced).toBe(1000)
    })

    it('should not touch producer groups on repeated plain recalculations', () => {
      calculateFactories([factory], gameData)
      calculateFactories([factory], gameData)

      expect(producer.buildingGroups).toHaveLength(2)
      expect(producer.buildingGroups[0].buildingCount).toBe(1)
      expect(producer.buildingGroups[1].buildingCount).toBe(1)
      expect(producer.buildingGroups[1].supplyMatrixes).toBe(true)
    })
  })

  describe('group parts and power remain derived', () => {
    it('should still recompute group parts and power from the preserved groups', () => {
      factory = newFactory('Rod factory')
      addProductToFactory(factory, { id: 'IronRod', amount: 37.5, recipe: 'IronRod' })
      calculateFactories([factory], gameData)

      const group = factory.products[0].buildingGroups[0]
      group.buildingCount = 1
      group.overclockPercent = 250
      calculateFactories([factory], gameData, { origin: 'recalculate' })

      // Derived data (parts, power) must still track the sacrosanct inputs.
      expect(group.parts.IronRod).toBe(37.5)
      expect(group.powerUsage).toBeGreaterThan(0)
      expect(factory.products[0].buildingRequirements.amount).toBe(2.5)
    })
  })
})
