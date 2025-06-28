// This file serves to orchestrate the demands of the feature.
// I was getting too confused with myself and was scatter-braining all over the place.
// These sets of tests therefore will mandate what exactly we want out of the buildings group feature.
// In effect this is TDD, and if any tests fail in here it's a major problem.

import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryItem, FactoryPowerChangeType, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { fetchGameData } from '@/utils/gameDataService'

describe('building groups sanity', async () => {
  const gameData = await fetchGameData()

  let mockFactory: Factory
  let products: FactoryItem[]
  let producers: FactoryPowerProducer[]
  const mockProduct = {
    id: 'IronIngot',
    amount: 300,
    recipe: 'IngotIron',
  }
  const mockPowerProducer = {
    building: 'generatorfuel',
    buildingAmount: 2,
    recipe: 'GeneratorFuel_LiquidFuel',
    updated: FactoryPowerChangeType.Building,
  }

  beforeEach(() => {
    mockFactory = newFactory('Building Group Test Factory')
    products = mockFactory.products
    producers = mockFactory.powerProducers
  })

  describe('adding building groups', () => {
    describe('product', () => {
      it('when the first building group is added to a product, it should have the correct buildings', () => {
        addProductToFactory(mockFactory, mockProduct)

        expect(products[0].amount).toBe(300)
        expect(products[0].buildingGroups[0].buildingCount).toBe(10)
      })
    })

    describe('power', () => {
      it('should have the correct building count when the first building group is added to a producer', () => {
        addPowerProducerToFactory(mockFactory, mockPowerProducer)

        const group = producers[0].buildingGroups[0]
        expect(group.buildingCount).toBe(2)
      })
    })
  })

  describe('factory calculation logic', () => {
    describe('products', () => {
      beforeEach(() => {
        addProductToFactory(mockFactory, mockProduct)
        calculateFactories([mockFactory], gameData)
      })

      it('should calculate the correct parts for a building group upon factory calculation', () => {
        const parts = products[0].buildingGroups[0].parts
        expect(parts.IronIngot).toBe(300)
        expect(parts.OreIron).toBe(300)
      })
    })

    describe('power', () => {
      beforeEach(() => {
        addPowerProducerToFactory(mockFactory, mockPowerProducer)
        calculateFactories([mockFactory], gameData)
      })

      it('should calculate the correct parts for the building group upon factory calculation', () => {
        const parts = producers[0].buildingGroups[0].parts
        expect(parts.LiquidFuel).toBe(40)
      })
    })
  })

  describe('user changes', () => {
    describe('products', () => {
      beforeEach(() => {
        addProductToFactory(mockFactory, mockProduct)
        calculateFactories([mockFactory], gameData)
      })

      it('should update the building group when the product amount changes if sync is turned on', () => {
        products[0].amount = 600
        products[0].buildingGroupItemSync = true
        calculateFactories([mockFactory], gameData)

        const parts = products[0].buildingGroups[0].parts
        expect(parts.IronIngot).toBe(600)
        expect(parts.OreIron).toBe(600)
      })

      it('should update NOT the building group when the product amount changes if sync is turned off', () => {
        products[0].amount = 600
        products[0].buildingGroupItemSync = false
        calculateFactories([mockFactory], gameData)

        const parts = products[0].buildingGroups[0].parts
        expect(parts.IronIngot).toBe(600)
        expect(parts.OreIron).toBe(600)
      })
    })
  })
})
