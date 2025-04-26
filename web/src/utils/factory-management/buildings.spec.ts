import { beforeEach, describe, expect, it } from 'vitest'
import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer,
  ItemType,
} from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { calculateFactoryBuildingsAndPower, calculateFinalBuildingsAndPower } from '@/utils/factory-management/buildings'
import { gameData } from '@/utils/gameData'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'
import { syncBuildingGroups } from '@/utils/factory-management/building-groups/common'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'

const doProductCalculations = (mockFactory: Factory, product: FactoryItem) => {
  calculateFactoryBuildingsAndPower(mockFactory, gameData)
  syncBuildingGroups(product, ItemType.Product, mockFactory)
}

describe('buildings', () => {
  let mockFactory: Factory
  let product: FactoryItem
  let producer: FactoryPowerProducer
  let productGroup: BuildingGroup
  let producerGroup: BuildingGroup

  beforeEach(() => {
    mockFactory = newFactory('Test Factory')
    addProductToFactory(mockFactory, {
      id: 'Cement',
      amount: 120,
      recipe: 'Concrete',
    })
    product = mockFactory.products[0]
    productGroup = product.buildingGroups[0]

    addPowerProducerToFactory(mockFactory, {
      building: 'generatorfuel',
      buildingAmount: 4,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Building,
    })
    producer = mockFactory.powerProducers[0]
    producerGroup = producer.buildingGroups[0]
  })

  describe('calculateFinalBuildingsAndPower', () => {
    describe('power calculations', () => {
      describe('product', () => {
        beforeEach(() => {
          doProductCalculations(mockFactory, product)
        })

        it('should calculate the correct power usage across the factory for one product', () => {
          calculateFinalBuildingsAndPower(mockFactory)

          expect(productGroup.powerUsage).toBe(32)
          expect(mockFactory.power.consumed).toBe(32)
          expect(mockFactory.power.produced).toBe(0)
          expect(mockFactory.power.consumed).toBe(32)
        })

        it('should calculate the correct power usage for an overclocked product', () => {
          addProductBuildingGroup(product, mockFactory, true) // Sets it into advanced mode so it doesn't do auto-rebalancing. We technically break our product here, but it's ok for testing.
          const group2 = product.buildingGroups[1]
          productGroup.buildingCount = 0 // Set this so we have full control over the 2nd group
          group2.overclockPercent = 200
          group2.buildingCount = 10

          doProductCalculations(mockFactory, product)
          calculateFinalBuildingsAndPower(mockFactory)

          expect(group2.powerUsage).toBe(100)
          expect(mockFactory.power.consumed).toBe(100)
        })

        it('should calculate the correct power usage across multiple groups for one product', () => {
          addProductBuildingGroup(product, mockFactory, true)
          const group2 = product.buildingGroups[1]
          productGroup.buildingCount = 5
          group2.overclockPercent = 200
          group2.buildingCount = 10

          doProductCalculations(mockFactory, product)
          calculateFinalBuildingsAndPower(mockFactory)

          expect(mockFactory.power.consumed).toBe(120)
        })

        it('should calculate the power consumption across multiple products', () => {
          addProductToFactory(mockFactory, {
            id: 'CopperIngot',
            amount: 150,
            recipe: 'IngotCopper',
          })
          const group2 = mockFactory.products[1].buildingGroups[0]

          calculateFactories([mockFactory], gameData) // Difficult to do it per product, has to be all of them

          expect(productGroup.powerUsage).toBe(32)
          expect(group2.powerUsage).toBe(20) // 5 smelters 5mw each
          expect(mockFactory.power.consumed).toBe(52)
        })

        it('should calculate the power consumption across multiple products with overclocks', () => {
          addProductToFactory(mockFactory, {
            id: 'CopperIngot',
            amount: 150,
            recipe: 'IngotCopper',
          })
          const product2 = mockFactory.products[1]
          const group2 = product2.buildingGroups[0]
          group2.buildingCount = 0
          addProductBuildingGroup(product2, mockFactory, false) // Sets it into advanced mode
          product2.buildingGroups[1].buildingCount = 0
          group2.buildingCount = 5

          group2.overclockPercent = 150
          productGroup.overclockPercent = 120

          calculateFactories([mockFactory], gameData) // Difficult to do it per product, has to be all of them

          expect(productGroup.powerUsage).toBe(32)
          expect(group2.powerUsage).toBe(34.183) // 5 smelters 5mw each
          expect(mockFactory.power.consumed).toBe(66.2)
        })
      })

      describe('power producers', () => {
        it('should correctly calculate the amount of power produced for a singular group', () => {
          calculateFactories([mockFactory], gameData)

          // Default buildings is 4, 250MW per building
          expect(producerGroup.powerProduced).toBe(1000)
          expect(mockFactory.power.produced).toBe(1000)
        })
      })
    })

    describe('building groups', () => {
      describe('products', () => {
        it('should properly calculate the number of buildings derived from a singular building group', () => {
          calculateFinalBuildingsAndPower(mockFactory)

          expect(productGroup.buildingCount).toBe(8)
          expect(mockFactory.buildingRequirements.constructormk1.amount).toBe(8)
        })

        it('should properly calculate the number of buildings derived from multiple building group', () => {
          addProductBuildingGroup(product, mockFactory, true)
          const group2 = product.buildingGroups[1]
          productGroup.buildingCount = 5
          group2.buildingCount = 10

          calculateFinalBuildingsAndPower(mockFactory)

          expect(mockFactory.buildingRequirements.constructormk1.amount).toBe(15)
        })

        it('should properly calculate the number of buildings derived from multiple products with singular groups', () => {
          addProductToFactory(mockFactory, {
            id: 'Cement',
            amount: 90,
            recipe: 'Concrete',
          })
          const product2 = mockFactory.products[1]
          const group2 = product2.buildingGroups[0]

          calculateFactories([mockFactory], gameData) // Hard to do it across multiple products

          expect(productGroup.buildingCount).toBe(8)
          expect(group2.buildingCount).toBe(6)
          expect(mockFactory.buildingRequirements.constructormk1.amount).toBe(14)
        })

        it('should properly calculate the number of buildings derived from multiple products with multiple groups', () => {
          addProductBuildingGroup(product, mockFactory, false)
          const group2 = product.buildingGroups[1]

          addProductToFactory(mockFactory, {
            id: 'Cement',
            amount: 90,
            recipe: 'Concrete',
          })
          const product2 = mockFactory.products[1]
          const group1p2 = product2.buildingGroups[0]
          addProductBuildingGroup(product2, mockFactory, false)
          const group2p2 = product2.buildingGroups[1]

          // Set the building counts
          productGroup.buildingCount = 5
          group2.buildingCount = 10
          group1p2.buildingCount = 5
          group2p2.buildingCount = 10

          calculateFactories([mockFactory], gameData) // Hard to do it across multiple products

          expect(mockFactory.buildingRequirements.constructormk1.amount).toBe(30)
        })
      })

      describe('powerProducers', () => {

      })
    })
  })
})
