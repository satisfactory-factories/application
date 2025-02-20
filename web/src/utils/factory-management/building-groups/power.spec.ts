import {
  BuildingGroup,
  Factory, FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer,
} from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import { beforeEach, describe, expect, it } from 'vitest'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'

describe('buildingGroupsPower', async () => {
  let mockFactory: Factory
  let factories: Factory[]
  let productBuildingGroups: BuildingGroup[]
  let powerBuildingGroups: BuildingGroup[]
  let product: FactoryItem
  let powerProducer: FactoryPowerProducer
  const gameData = await fetchGameData()

  beforeEach(() => {
    mockFactory = newFactory('Test Factory')
    factories = [mockFactory]

    addProductToFactory(mockFactory, {
      id: 'IronIngot',
      amount: 150,
      recipe: 'IngotIron',
    })
    product = mockFactory.products[0]

    addPowerProducerToFactory(mockFactory, {
      building: 'generatorfuel',
      ingredientAmount: 80,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Ingredient,
    })
    powerProducer = mockFactory.powerProducers[0]

    // Calculate factory to get some extra contextual info, then blow the building groups away
    calculateFactories(factories, gameData)
    product.buildingGroups = []
    powerProducer.buildingGroups = []

    productBuildingGroups = product.buildingGroups
    powerBuildingGroups = powerProducer.buildingGroups
    expect(productBuildingGroups.length).toBe(0)
    expect(productBuildingGroups.length).toBe(0)
  })

  // Basic testing of addPowerProducerBuildingGroup is also done by ./common.spec.ts

  describe('addPowerProducerBuildingGroup', () => {
    it('should add a new group to the power producer with the correct building count', () => {
      addPowerProducerBuildingGroup(powerProducer)

      expect(powerBuildingGroups.length).toBe(1)
      expect(powerBuildingGroups[0].buildingCount).toBe(5)
    })

    // it('should add a new group to the power producer with 0 buildings when asked', () => {
    //   addPowerProducerBuildingGroup(product, false)
    //
    //   expect(powerBuildingGroups.length).toBe(1)
    //   expect(powerBuildingGroups[0].buildingCount).toBe(0)
    // })
    //
    // it('should add a new group to the power producer with the correct parts', () => {
    //   addPowerProducerBuildingGroup(product)
    //
    //   expect(powerBuildingGroups[0].parts.OreIron).toBe(150)
    //   expect(powerBuildingGroups[0].parts.IronIngot).toBe(150)
    // })
    // it('should add a multiple groups each containing the correct part amounts', () => {
    //   addPowerProducerBuildingGroup(product) // The first group should contain the full requirement
    //   addPowerProducerBuildingGroup(product, false)
    //
    //   expect(powerBuildingGroups[0].parts.OreIron).toBe(150)
    //   expect(powerBuildingGroups[0].parts.IronIngot).toBe(150)
    //   expect(powerBuildingGroups[1].parts.OreIron).toBe(0)
    //   expect(powerBuildingGroups[1].parts.IronIngot).toBe(0)
    // })
    // it('should automatically add a group when a product is added to a factory', () => {
    //   addPowerProducerBuildingGroup(mockFactory, {
    //     id: 'CopperIngot',
    //     amount: 150,
    //     recipe: 'IngotCopper',
    //   })
    //
    //   const product2 = mockFactory.products[1]
    //
    //   expect(product.powerBuildingGroups.length).toBe(1)
    //   expect(product2.powerBuildingGroups[0].buildingCount).toBe(5)
    // })
  })
})
