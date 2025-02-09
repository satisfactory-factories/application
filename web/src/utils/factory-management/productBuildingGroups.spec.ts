import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory, FactoryItem, ProductBuildingGroup } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import {
  addBuildingGroup, calculateBuildingGroupParts, calculateBuildingGroupProblems,
  calculateEffectiveBuildingCount,
  rebalanceGroups, remainderToLast, remainderToNewGroup,
} from '@/utils/factory-management/productBuildingGroups'
import { addProductToFactory, increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
import { fetchGameData } from '@/utils/gameDataService'

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}))

describe('productBuildingGroups', async () => {
  let mockFactory: Factory
  let factories: Factory[]
  let buildingGroups: ProductBuildingGroup[]
  const gameData = await fetchGameData()

  beforeEach(() => {
    mockFactory = newFactory('Test Factory')
    factories = [mockFactory]

    addProductToFactory(mockFactory, {
      id: 'IronIngot',
      amount: 150,
      recipe: 'IngotIron',
    })

    // Calculate factory to get some extra contextual info, then blow the building groups away
    calculateFactories(factories, gameData)
    mockFactory.products[0].buildingGroups = []

    buildingGroups = mockFactory.products[0].buildingGroups
    expect(buildingGroups.length).toBe(0)
  })

  describe('addGroup', () => {
    it('should add a new group to the product with the correct building count', () => {
      addBuildingGroup(mockFactory.products[0])

      expect(buildingGroups.length).toBe(1)
      expect(buildingGroups[0].buildingCount).toBe(5)
    })

    it('should add a new group to the product with 0 buildings when asked', () => {
      addBuildingGroup(mockFactory.products[0], false)

      expect(buildingGroups.length).toBe(1)
      expect(buildingGroups[0].buildingCount).toBe(0)
    })

    it('should add a new group to the product with the correct parts', () => {
      addBuildingGroup(mockFactory.products[0])

      expect(buildingGroups[0].parts.OreIron).toBe(150)
      expect(buildingGroups[0].parts.IronIngot).toBe(150)
    })
    it('should add a multiple groups each containing the correct part amounts', () => {
      addBuildingGroup(mockFactory.products[0]) // The first group should contain the full requirement
      addBuildingGroup(mockFactory.products[0], false)

      expect(buildingGroups[0].parts.OreIron).toBe(150)
      expect(buildingGroups[0].parts.IronIngot).toBe(150)
      expect(buildingGroups[1].parts.OreIron).toBe(0)
      expect(buildingGroups[1].parts.IronIngot).toBe(0)
    })
    it('should automatically add a group when a product is added to a factory', () => {
      addProductToFactory(mockFactory, {
        id: 'CopperIngot',
        amount: 150,
        recipe: 'IngotCopper',
      })

      const product = mockFactory.products[1]

      expect(product.buildingGroups.length).toBe(1)
      expect(product.buildingGroups[0].buildingCount).toBe(5)
    })
  })

  describe('rebalanceGroups', () => {
    let group1: ProductBuildingGroup
    let product: FactoryItem

    beforeEach(() => {
      product = mockFactory.products[0]
      addBuildingGroup(product)
      group1 = product.buildingGroups[0]

      calculateFactories(factories, gameData)
    })

    it('should apply an underclock to the group if the building count is not whole', () => {
      product.buildingRequirements.amount = 5.5

      rebalanceGroups(product)

      expect(group1.buildingCount).toBe(6)
      expect(group1.overclockPercent).toBe(91.667) // 6 * 0.91667 = 5.5
    })

    it('should apply an underclock to the group if the building count is not whole', () => {
      product.buildingRequirements.amount = 5.7

      rebalanceGroups(product)

      expect(group1.buildingCount).toBe(6)
      expect(group1.overclockPercent).toBe(95) // 6 * 0.95 = 5.7
    })

    it('should apply no clock changes on whole buildings', () => {
      product.buildingRequirements.amount = 4

      rebalanceGroups(product)

      expect(group1.buildingCount).toBe(4)
      expect(group1.overclockPercent).toBe(100)
    })

    describe('multiple groups', () => {
      let group2: ProductBuildingGroup

      beforeEach(() => {
        addBuildingGroup(product)
        group2 = product.buildingGroups[1]
      })

      it('should not rebalance when in advanced mode and not forced', () => {
        // Assert the before
        expect(group1.buildingCount).toBe(5)
        expect(group2.buildingCount).toBe(5)
        product.buildingRequirements.amount = 20

        rebalanceGroups(product)

        // Nothing should have changed
        expect(group1.buildingCount).toBe(5)
        expect(group2.buildingCount).toBe(5)
      })

      it('should distribute the building count evenly', () => {
        product.buildingRequirements.amount = 6

        rebalanceGroups(product, true)

        expect(group1.buildingCount).toBe(3)
        expect(group2.buildingCount).toBe(3)
      })

      it('should distribute the building count evenly with odd numbers resulting in an underclock', () => {
        product.buildingRequirements.amount = 5

        rebalanceGroups(product, true)

        expect(group1.buildingCount).toBe(3)
        expect(group2.buildingCount).toBe(3)

        expect(group1.overclockPercent).toBe(83.333)
        expect(group2.overclockPercent).toBe(83.333)
      })

      it('should distribute the fractional group with an underclock', () => {
        product.buildingRequirements.amount = 3

        rebalanceGroups(product, true)

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
        calculateBuildingGroupParts([product])

        expect(group2.parts.OreIron).toBe(90)
        expect(group2.parts.IronIngot).toBe(90)

        rebalanceGroups(product)

        expect(group1.buildingCount).toBe(2)
        expect(group2.buildingCount).toBe(2)

        expect(group2.parts.OreIron).toBe(60)
        expect(group2.parts.IronIngot).toBe(60)
      })
    })
  })

  describe('calculateBuildingGroupParts', () => {
    let group: ProductBuildingGroup
    let product: FactoryItem
    beforeEach(() => {
      addBuildingGroup(mockFactory.products[0])
      calculateFactories(factories, gameData)
      product = mockFactory.products[0]
      group = mockFactory.products[0].buildingGroups[0]
    })

    it('should properly calculate the parts for a product with a single group when updated', () => {
      // Assert the before
      expect(group.parts.OreIron).toBe(150)
      expect(group.parts.IronIngot).toBe(150)

      group.buildingCount = 10 // This should force a recalculation, originally it's 5

      calculateBuildingGroupParts([mockFactory.products[0]])

      expect(group.parts.OreIron).toBe(300)
      expect(group.parts.IronIngot).toBe(300)
    })

    it('should properly calculate the parts for a product with multiple groups when updated', () => {
      addBuildingGroup(product, false)
      const group2 = product.buildingGroups[1]

      // Assert the before
      expect(group.parts.OreIron).toBe(150)
      expect(group2.parts.OreIron).toBe(0)
      expect(group.parts.IronIngot).toBe(150)
      expect(group2.parts.IronIngot).toBe(0)

      group.buildingCount = 11.5
      group2.buildingCount = 5.5

      calculateBuildingGroupParts([product])

      expect(group.parts.OreIron).toBe(345)
      expect(group.parts.IronIngot).toBe(345)
      expect(group2.parts.OreIron).toBe(165)
      expect(group2.parts.IronIngot).toBe(165)
    })

    it('should not adjust any clocks', () => {
      // Assert the before
      expect(group.overclockPercent).toBe(100)

      group.buildingCount = 11.5 // This requires 12 buildings and one at 50%

      calculateBuildingGroupParts([mockFactory.products[0]])

      expect(group.overclockPercent).toBe(100)
    })

    describe('overclocking', () => {
      it('should correctly apply an overclock to the parts', () => {
        group.buildingCount = 10
        group.overclockPercent = 150

        calculateBuildingGroupParts([mockFactory.products[0]])

        // 30 * 1.5 = 45 * 10 = 450
        expect(group.parts.OreIron).toBe(450)
        expect(group.parts.IronIngot).toBe(450)
      })

      it('should correctly apply a underclock to the parts', () => {
        group.buildingCount = 10
        group.overclockPercent = 50

        calculateBuildingGroupParts([mockFactory.products[0]])

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

        addBuildingGroup(mockFactory.products[1])
        addBuildingGroup(mockFactory.products[1]) // Puts it in advanced mode
        const group2 = mockFactory.products[1].buildingGroups[0]

        // Test 1: 150% overclock
        group2.buildingCount = 1
        group2.overclockPercent = 150

        calculateBuildingGroupParts([mockFactory.products[1]])

        expect(group2.parts.OreCopper).toBe(22.5)
        expect(group2.parts.Water).toBe(15)
        expect(group2.parts.CopperIngot).toBe(56.25)

        // Test 2: 212.55% overclock, also testing the precision of the parts
        group2.overclockPercent = 212.55

        calculateBuildingGroupParts([mockFactory.products[1]])

        expect(group2.parts.OreCopper).toBe(31.882)
        expect(group2.parts.Water).toBe(21.255)
        expect(group2.parts.CopperIngot).toBe(79.706)
      })
    })
  })

  describe('calculateEffectiveBuildingCount', () => {
    let group1: ProductBuildingGroup
    let group2: ProductBuildingGroup
    let product: FactoryItem
    beforeEach(() => {
      product = mockFactory.products[0]
      addBuildingGroup(product)
      group1 = product.buildingGroups[0]
    })
    it('should properly calculate the effective building count across multiple groups', () => {
      addBuildingGroup(product)
      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]

      group1.buildingCount = 3
      group1.overclockPercent = 100

      group2.buildingCount = 2
      group2.overclockPercent = 150

      // Should be:
      // 3 + 2 * 1.5 = 6

      expect(calculateEffectiveBuildingCount(product)).toBe(6)
    })

    it('should properly calculate the effective building count across multiple groups with precise percentages', () => {
      addBuildingGroup(product)
      addBuildingGroup(product)
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

      expect(calculateEffectiveBuildingCount(product)).toBe(19.822)
    })
  })

  describe('remainder handling', () => {
    let group1: ProductBuildingGroup
    let group2: ProductBuildingGroup
    let product: FactoryItem
    beforeEach(() => {
      product = mockFactory.products[0]
      addBuildingGroup(product)
      addBuildingGroup(product)

      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]
    })

    describe('remainderToLast', () => {
      it('should properly add the remainder to the last group when a full number', () => {
        product.buildingRequirements.amount = 5

        group1.buildingCount = 3
        group2.buildingCount = 1 // Missing 1

        remainderToLast(product)

        expect(group1.buildingCount).toBe(3)
        expect(group1.overclockPercent).toBe(100)
        expect(group2.buildingCount).toBe(2)
        expect(group2.overclockPercent).toBe(100)
      })

      it('should properly add the remainder to the last group when not a full number', () => {
        product.buildingRequirements.amount = 131.1

        group1.buildingCount = 131
        group2.buildingCount = 1 // Which will need a 10% overclock

        remainderToLast(product)

        expect(group1.buildingCount).toBe(131)
        expect(group1.overclockPercent).toBe(100)
        expect(group2.buildingCount).toBe(1)
        expect(group2.overclockPercent).toBe(10)
      })

      it('should properly add the remainder to the last group when it already has a overclock', () => {
        product.buildingRequirements.amount = 131.1

        group1.buildingCount = 131
        group2.buildingCount = 1 // Which will need a 10% overclock
        group2.overclockPercent = 50 // 40% too high

        remainderToLast(product)

        expect(group1.buildingCount).toBe(131)
        expect(group1.overclockPercent).toBe(100)
        expect(group2.buildingCount).toBe(1)
        expect(group2.overclockPercent).toBe(10)
      })

      it('should properly adjust the group to account for massive disparities and underclock the result', () => {
        product.buildingRequirements.amount = 5.5

        group1.buildingCount = 2
        group2.buildingCount = 1
        group2.overclockPercent = 10

        remainderToLast(product)

        // This scenario is not 100% possible to equate to perfect numbers.
        // Therefore, we expect a "best effort" of the number of buildings being overallocated, and underclocked, rather than overclocked, which needs a shard.
        expect(group1.buildingCount).toBe(2)
        expect(group1.overclockPercent).toBe(100)
        expect(group2.buildingCount).toBe(4)
        expect(group2.overclockPercent).toBe(88)
      })
    })

    describe('remainderToNewGroup', () => {
      it('should properly add the remainder to a new group when a full number', () => {
        product.buildingRequirements.amount = 5

        group1.buildingCount = 3
        group2.buildingCount = 1 // Missing 1

        remainderToNewGroup(product)

        expect(product.buildingGroups.length).toBe(3)
        expect(product.buildingGroups[2].buildingCount).toBe(1)
        expect(product.buildingGroups[2].overclockPercent).toBe(100)
      })

      it('should properly add the remainder to a new group when a fractional', () => {
        product.buildingRequirements.amount = 5.5

        group1.buildingCount = 3
        group2.buildingCount = 2 // Missing 0.5

        remainderToNewGroup(product)

        expect(product.buildingGroups.length).toBe(3)
        expect(product.buildingGroups[2].buildingCount).toBe(1)
        expect(product.buildingGroups[2].overclockPercent).toBe(50)
      })

      it('should do nothing when the remainder is negative', () => {
        product.buildingRequirements.amount = 5.5

        group1.buildingCount = 3
        group2.buildingCount = 3 // 0.5 too many

        remainderToNewGroup(product)

        expect(product.buildingGroups.length).toBe(2)
      })
    })
  })

  describe('overclocking', () => {
    let factory: Factory
    let factories: Factory[]
    let group1: ProductBuildingGroup
    let product: FactoryItem

    beforeEach(() => {
      factory = newFactory('Test Overclocking Factory')
      factories = [factory]
      addProductToFactory(factory, {
        id: 'CopperIngot',
        amount: 30,
        recipe: 'IngotCopper',
      }) // This adds a building group
      product = factory.products[0]

      group1 = product.buildingGroups[0]
      calculateFactories(factories, gameData)
    })

    it('should correctly apply the overclock to the group, updating the parts consumed and produced', () => {
      group1.overclockPercent = 150

      calculateBuildingGroupParts([product])

      expect(group1.parts.OreCopper).toBe(45)
      expect(group1.parts.CopperIngot).toBe(45)
    })
  })

  describe('calculateBuildingGroupProblems', () => {
    let group1: ProductBuildingGroup
    let group2: ProductBuildingGroup
    let product: FactoryItem

    beforeEach(() => {
      product = mockFactory.products[0]
      addBuildingGroup(product)
      addBuildingGroup(product)
      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]
    })

    it('should correctly identify when a building group has a problem', () => {
      // Lower the effective building count from 5 to 4
      group1.buildingCount = 1
      group2.buildingCount = 3

      calculateBuildingGroupProblems(mockFactory.products[0])

      expect(product.buildingGroupsHaveProblem).toBe(true)
    })

    it('should remove the problem flag when it has been resolved', () => {
      // Lower the effective building count from 5 to 4
      group1.buildingCount = 1
      group2.buildingCount = 3

      calculateBuildingGroupProblems(mockFactory.products[0])

      expect(product.buildingGroupsHaveProblem).toBe(true)

      // Now fix the problem
      group1.buildingCount = 2
      group2.buildingCount = 3

      calculateBuildingGroupProblems(mockFactory.products[0])

      expect(product.buildingGroupsHaveProblem).toBe(false)
    })
  })
})
