import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer,
  GroupType,
} from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import { beforeEach, describe, expect, it } from 'vitest'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory, increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'
import {
  calculateBuildingGroupParts,
  calculateBuildingGroupProblems,
  calculateEffectiveBuildingCount,
  rebalanceBuildingGroups,
  toggleBuildingGroupTray,
} from '@/utils/factory-management/building-groups/common'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'

describe('buildingGroupsCommon', async () => {
  let mockFactory: Factory
  let factories: Factory[]
  let product: FactoryItem
  let powerProducer: FactoryPowerProducer
  let productBuildingGroups: BuildingGroup[]
  let powerBuildingGroups: BuildingGroup[]
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
    mockFactory.powerProducers[0].buildingGroups = []

    productBuildingGroups = product.buildingGroups
    powerBuildingGroups = mockFactory.powerProducers[0].buildingGroups
    expect(productBuildingGroups.length).toBe(0)
    expect(productBuildingGroups.length).toBe(0)
  })

  describe('addGroup', () => {
    it('should add a product group', () => {
      addProductBuildingGroup(product)

      expect(productBuildingGroups.length).toBe(1)
      expect(productBuildingGroups[0].type).toBe(GroupType.Product)
      expect(productBuildingGroups[0].buildingCount).toBe(5)
      expect(productBuildingGroups[0].overclockPercent).toBe(100)
    })

    it('should add a power producer group', () => {
      addPowerProducerBuildingGroup(mockFactory.powerProducers[0])

      expect(powerBuildingGroups.length).toBe(1)
      expect(powerBuildingGroups[0].type).toBe(GroupType.Power)
      expect(powerBuildingGroups[0].buildingCount).toBe(4)
      expect(powerBuildingGroups[0].overclockPercent).toBe(100)
    })
  })

  describe('calculateEffectiveBuildingCount', () => {
    let group1: BuildingGroup
    let group2: BuildingGroup

    beforeEach(() => {
      addProductBuildingGroup(product)
      group1 = product.buildingGroups[0]
    })

    it('should properly calculate the effective building count across multiple groups', () => {
      addProductBuildingGroup(product)
      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]

      group1.buildingCount = 3
      group1.overclockPercent = 100

      group2.buildingCount = 2
      group2.overclockPercent = 150

      // Should be:
      // 3 + 2 * 1.5 = 6

      expect(calculateEffectiveBuildingCount(product.buildingGroups)).toBe(6)
    })

    it('should properly calculate the effective building count across multiple groups with precise percentages', () => {
      addProductBuildingGroup(product)
      addProductBuildingGroup(product)
      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]
      const group3 = product.buildingGroups[2]

      group1.buildingCount = 3
      group1.overclockPercent = 133

      group2.buildingCount = 2
      group2.overclockPercent = 56.334

      group3.buildingCount = 11
      group3.overclockPercent = 133.678

      // Should be:
      // Group 1: 3 * 1.33 = 3.99
      // Group 2: 2 * 0.56334 = 1.12668 (1.127 ceiled)
      // Group 3: 11 * 1.33678 = 14.70458 (14.705 ceiled)
      // Totalling 19.822

      expect(calculateEffectiveBuildingCount(product.buildingGroups)).toBe(19.821)
    })
  })

  describe('calculateBuildingGroupProblems', () => {
    let group1: BuildingGroup
    let group2: BuildingGroup

    beforeEach(() => {
      addProductBuildingGroup(product)
      addProductBuildingGroup(product)
      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]
    })

    it('should correctly identify when a building group has a problem', () => {
      // Lower the effective building count from 5 to 4
      group1.buildingCount = 1
      group2.buildingCount = 3

      calculateBuildingGroupProblems(product, GroupType.Product)

      expect(product.buildingGroupsHaveProblem).toBe(true)
    })

    it('should remove the problem flag when it has been resolved', () => {
      // Lower the effective building count from 5 to 4
      group1.buildingCount = 1
      group2.buildingCount = 3

      calculateBuildingGroupProblems(product, GroupType.Product)

      expect(product.buildingGroupsHaveProblem).toBe(true)

      // Now fix the problem
      group1.buildingCount = 2
      group2.buildingCount = 3

      calculateBuildingGroupProblems(product, GroupType.Product)

      expect(product.buildingGroupsHaveProblem).toBe(false)
    })
  })

  describe('rebalanceGroups', () => {
    let group1: BuildingGroup

    beforeEach(() => {
      addProductBuildingGroup(product)
      group1 = product.buildingGroups[0]

      calculateFactories(factories, gameData)
    })

    describe('products', () => {
      it('should apply an underclock to the group if the building count is not whole', () => {
        product.buildingRequirements.amount = 5.5

        rebalanceBuildingGroups(product, GroupType.Product)

        expect(group1.buildingCount).toBe(6)
        expect(group1.overclockPercent).toBe(91.667) // 6 * 0.91667 = 5.5
      })

      it('should apply an underclock to the group if the building count is not whole', () => {
        product.buildingRequirements.amount = 5.7

        rebalanceBuildingGroups(product, GroupType.Product)

        expect(group1.buildingCount).toBe(6)
        expect(group1.overclockPercent).toBe(95) // 6 * 0.95 = 5.7
      })

      it('should apply no clock changes on whole buildings', () => {
        product.buildingRequirements.amount = 4

        rebalanceBuildingGroups(product, GroupType.Product)

        expect(group1.buildingCount).toBe(4)
        expect(group1.overclockPercent).toBe(100)
      })

      describe('multiple groups', () => {
        let group2: BuildingGroup

        beforeEach(() => {
          addProductBuildingGroup(product)
          group2 = product.buildingGroups[1]
        })

        it('should not rebalance when in advanced mode and not forced', () => {
        // Assert the before
          expect(group1.buildingCount).toBe(5)
          expect(group2.buildingCount).toBe(5)
          product.buildingRequirements.amount = 20

          rebalanceBuildingGroups(product, GroupType.Product)

          // Nothing should have changed
          expect(group1.buildingCount).toBe(5)
          expect(group2.buildingCount).toBe(5)
        })

        it('should distribute the building count evenly', () => {
          product.buildingRequirements.amount = 6

          rebalanceBuildingGroups(product, GroupType.Product, { force: true })

          expect(group1.buildingCount).toBe(3)
          expect(group2.buildingCount).toBe(3)
        })

        it('should distribute the building count evenly with odd numbers resulting in an underclock', () => {
          product.buildingRequirements.amount = 5

          rebalanceBuildingGroups(product, GroupType.Product, { force: true })

          expect(group1.buildingCount).toBe(3)
          expect(group2.buildingCount).toBe(3)

          expect(group1.overclockPercent).toBe(83.333)
          expect(group2.overclockPercent).toBe(83.333)
        })

        it('should distribute the fractional group with an underclock', () => {
          product.buildingRequirements.amount = 3

          rebalanceBuildingGroups(product, GroupType.Product, { force: true })

          expect(group1.buildingCount).toBe(2)
          expect(group2.buildingCount).toBe(2)

          expect(group1.overclockPercent).toBe(75)
          expect(group2.overclockPercent).toBe(75)
        })

        it('should distribute and update the resources correctly', () => {
          product.buildingRequirements.amount = 4
          increaseProductQtyViaBuilding(product, gameData)// Ensure it needs 4 buildings

          // Recalculate
          calculateFactories(factories, gameData)

          // Set the initial values, group 2 purposefully unbalanced
          group1.buildingCount = 2
          group2.buildingCount = 3

          // Calculate, it should be properly imbalanced
          calculateBuildingGroupParts([product], GroupType.Product)

          expect(group2.parts.OreIron).toBe(90)
          expect(group2.parts.IronIngot).toBe(90)

          // Now rebalance and recalculate, it should distribute evenly.
          rebalanceBuildingGroups(product, GroupType.Product, { force: true })
          calculateBuildingGroupParts([product], GroupType.Product)

          expect(group1.buildingCount).toBe(2)
          expect(group2.buildingCount).toBe(2)

          expect(group2.parts.OreIron).toBe(60)
          expect(group2.parts.IronIngot).toBe(60)
        })
      })
    })
  })

  describe('calculateBuildingGroupParts', () => {
    let group: BuildingGroup

    beforeEach(() => {
      addProductBuildingGroup(product)
      calculateFactories(factories, gameData)
      group = product.buildingGroups[0]
    })

    describe('product', () => {
      it('should calculate for a single group', () => {
        // Assert the before
        expect(group.parts.OreIron).toBe(150)
        expect(group.parts.IronIngot).toBe(150)

        group.buildingCount = 10 // This should force a recalculation, originally it's 5

        calculateBuildingGroupParts([product], GroupType.Product)

        expect(group.parts.OreIron).toBe(300)
        expect(group.parts.IronIngot).toBe(300)
      })

      it('should calculate for multiple groups', () => {
        addProductBuildingGroup(product, false)
        const group2 = product.buildingGroups[1]

        // Assert the before
        expect(group.parts.OreIron).toBe(150)
        expect(group2.parts.OreIron).toBe(0)
        expect(group.parts.IronIngot).toBe(150)
        expect(group2.parts.IronIngot).toBe(0)

        group.buildingCount = 11.5
        group2.buildingCount = 5.5

        calculateBuildingGroupParts([product], GroupType.Product)

        expect(group.parts.OreIron).toBe(345)
        expect(group.parts.IronIngot).toBe(345)
        expect(group2.parts.OreIron).toBe(165)
        expect(group2.parts.IronIngot).toBe(165)
      })

      it('should not adjust any clocks', () => {
      // Assert the before
        expect(group.overclockPercent).toBe(100)

        group.buildingCount = 11.5 // This requires 12 buildings and one at 50%

        calculateBuildingGroupParts([product], GroupType.Product)

        expect(group.overclockPercent).toBe(100)
      })

      describe('overclocking', () => {
        it('should correctly apply an overclock to the parts', () => {
          group.buildingCount = 10
          group.overclockPercent = 150

          calculateBuildingGroupParts([product], GroupType.Product)

          // 30 * 1.5 = 45 * 10 = 450
          expect(group.parts.OreIron).toBe(450)
          expect(group.parts.IronIngot).toBe(450)
        })

        it('should correctly apply a underclock to the parts', () => {
          group.buildingCount = 10
          group.overclockPercent = 50

          calculateBuildingGroupParts([product], GroupType.Product)

          // 30 * 0.5 = 15 * 10 = 150
          expect(group.parts.OreIron).toBe(150)
          expect(group.parts.IronIngot).toBe(150)
        })

        it('should correctly apply an in-game validated overclock', () => {
          addProductToFactory(mockFactory, {
            id: 'CopperIngot',
            amount: 120,
            recipe: 'Alternate_PureCopperIngot',
          })
          calculateFactories([mockFactory], gameData)

          addProductBuildingGroup(mockFactory.products[1])
          addProductBuildingGroup(mockFactory.products[1]) // Puts it in advanced mode
          const group2 = mockFactory.products[1].buildingGroups[0]

          // Test 1: 150% overclock
          group2.buildingCount = 1
          group2.overclockPercent = 150

          calculateBuildingGroupParts([mockFactory.products[1]], GroupType.Product)

          expect(group2.parts.OreCopper).toBe(22.5)
          expect(group2.parts.Water).toBe(15)
          expect(group2.parts.CopperIngot).toBe(56.25)

          // Test 2: 212.55% overclock, also testing the precision of the parts
          group2.overclockPercent = 212.55

          calculateBuildingGroupParts([mockFactory.products[1]], GroupType.Product)

          expect(group2.parts.OreCopper).toBe(31.882)
          expect(group2.parts.Water).toBe(21.255)
          expect(group2.parts.CopperIngot).toBe(79.706)

          // Test 3: 113.4933% overclock, testing to maximum precision
          group2.overclockPercent = 113.4933

          calculateBuildingGroupParts([mockFactory.products[1]], GroupType.Product)

          expect(group2.parts.OreCopper).toBe(17.023)
          expect(group2.parts.Water).toBe(11.349)
          expect(group2.parts.CopperIngot).toBe(42.559)
        })
      })
    })
  })

  describe('toggleBuildingGroupTray', () => {
    it('should open the tray if closed', () => {
      // Ensure it's closed first
      product.buildingGroupsTrayOpen = false

      toggleBuildingGroupTray(product)

      expect(product.buildingGroupsTrayOpen).toBe(true)
    })

    it('should close the tray if open', () => {
      // Ensure it's open first
      product.buildingGroupsTrayOpen = true

      toggleBuildingGroupTray(product)

      expect(product.buildingGroupsTrayOpen).toBe(false)
    })
  })
})
