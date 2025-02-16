import { BuildingGroup, Factory, FactoryItem, GroupType } from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import { beforeEach, describe, expect, it } from 'vitest'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory, increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
import {
  addProductBuildingGroup,
  calculateProductBuildingGroupParts,
} from '@/utils/factory-management/building-groups/product'
import {
  calculateBuildingGroupProblems,
  calculateEffectiveBuildingCount,
  rebalanceProductGroups,
} from '@/utils/factory-management/building-groups/common'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'

describe('buildingGroupsCommon', async () => {
  let mockFactory: Factory
  let factories: Factory[]
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

    addPowerProducerToFactory(mockFactory, {
      building: 'generatorfuel',
      ingredientAmount: 80,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: 'ingredient',
    })

    // Calculate factory to get some extra contextual info, then blow the building groups away
    calculateFactories(factories, gameData)
    mockFactory.products[0].buildingGroups = []
    mockFactory.powerProducers[0].buildingGroups = []

    productBuildingGroups = mockFactory.products[0].buildingGroups
    powerBuildingGroups = mockFactory.powerProducers[0].buildingGroups
    expect(productBuildingGroups.length).toBe(0)
    expect(productBuildingGroups.length).toBe(0)
  })

  describe('addGroup', () => {
    it('should add a product group', () => {
      addProductBuildingGroup(mockFactory.products[0])

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
    let product: FactoryItem
    beforeEach(() => {
      product = mockFactory.products[0]
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
    let product: FactoryItem

    beforeEach(() => {
      product = mockFactory.products[0]
      addProductBuildingGroup(product)
      addProductBuildingGroup(product)
      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]
    })

    it('should correctly identify when a building group has a problem', () => {
      // Lower the effective building count from 5 to 4
      group1.buildingCount = 1
      group2.buildingCount = 3

      calculateBuildingGroupProblems(mockFactory.products[0], GroupType.Product)

      expect(product.buildingGroupsHaveProblem).toBe(true)
    })

    it('should remove the problem flag when it has been resolved', () => {
      // Lower the effective building count from 5 to 4
      group1.buildingCount = 1
      group2.buildingCount = 3

      calculateBuildingGroupProblems(mockFactory.products[0], GroupType.Product)

      expect(product.buildingGroupsHaveProblem).toBe(true)

      // Now fix the problem
      group1.buildingCount = 2
      group2.buildingCount = 3

      calculateBuildingGroupProblems(mockFactory.products[0], GroupType.Product)

      expect(product.buildingGroupsHaveProblem).toBe(false)
    })
  })

  describe('rebalanceGroups', () => {
    let group1: BuildingGroup
    let product: FactoryItem

    beforeEach(() => {
      product = mockFactory.products[0]
      addProductBuildingGroup(product)
      group1 = product.buildingGroups[0]

      calculateFactories(factories, gameData)
    })

    it('should apply an underclock to the group if the building count is not whole', () => {
      product.buildingRequirements.amount = 5.5

      rebalanceProductGroups(product)

      expect(group1.buildingCount).toBe(6)
      expect(group1.overclockPercent).toBe(91.667) // 6 * 0.91667 = 5.5
    })

    it('should apply an underclock to the group if the building count is not whole', () => {
      product.buildingRequirements.amount = 5.7

      rebalanceProductGroups(product)

      expect(group1.buildingCount).toBe(6)
      expect(group1.overclockPercent).toBe(95) // 6 * 0.95 = 5.7
    })

    it('should apply no clock changes on whole buildings', () => {
      product.buildingRequirements.amount = 4

      rebalanceProductGroups(product)

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

        rebalanceProductGroups(product)

        // Nothing should have changed
        expect(group1.buildingCount).toBe(5)
        expect(group2.buildingCount).toBe(5)
      })

      it('should distribute the building count evenly', () => {
        product.buildingRequirements.amount = 6

        rebalanceProductGroups(product, true)

        expect(group1.buildingCount).toBe(3)
        expect(group2.buildingCount).toBe(3)
      })

      it('should distribute the building count evenly with odd numbers resulting in an underclock', () => {
        product.buildingRequirements.amount = 5

        rebalanceProductGroups(product, true)

        expect(group1.buildingCount).toBe(3)
        expect(group2.buildingCount).toBe(3)

        expect(group1.overclockPercent).toBe(83.333)
        expect(group2.overclockPercent).toBe(83.333)
      })

      it('should distribute the fractional group with an underclock', () => {
        product.buildingRequirements.amount = 3

        rebalanceProductGroups(product, true)

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
        calculateProductBuildingGroupParts([product])

        expect(group2.parts.OreIron).toBe(90)
        expect(group2.parts.IronIngot).toBe(90)

        rebalanceProductGroups(product)

        expect(group1.buildingCount).toBe(2)
        expect(group2.buildingCount).toBe(2)

        expect(group2.parts.OreIron).toBe(60)
        expect(group2.parts.IronIngot).toBe(60)
      })
    })
  })
})
