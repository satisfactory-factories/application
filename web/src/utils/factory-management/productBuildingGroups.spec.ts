import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryItem, ProductBuildingGroup } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import {
  addGroup,
  calculateEffectiveBuildingCount,
  rebalanceGroups,
} from '@/utils/factory-management/productBuildingGroups'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'

describe('productBuildingGroups', () => {
  let mockFactory: Factory
  let factories: Factory[]
  let buildingGroups: ProductBuildingGroup[]

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
    it('should add a new group to the product with correct details', () => {
      addGroup(mockFactory.products[0])
      expect(buildingGroups.length).toBe(1)
      expect(buildingGroups[0].buildingCount).toBe(5)
    })
    it('should add multiple groups, properly distributing the building counts', () => {
      addGroup(mockFactory.products[0])
      addGroup(mockFactory.products[0])

      expect(buildingGroups[0].buildingCount).toBe(3)
      expect(buildingGroups[1].buildingCount).toBe(2)

      addGroup(mockFactory.products[0])

      expect(buildingGroups[0].buildingCount).toBe(2)
      expect(buildingGroups[1].buildingCount).toBe(2)
      expect(buildingGroups[2].buildingCount).toBe(1)
    })

    it('should add a new group to the product with the correct parts', () => {
      addGroup(mockFactory.products[0])

      const group = buildingGroups[0]

      expect(group.parts.OreIron).toBe(150)
      expect(group.parts.IronIngot).toBe(150)
    })
    it('should add a multiple groups each containing the correct part amounts', () => {
      addGroup(mockFactory.products[0])
      addGroup(mockFactory.products[0])

      const group1 = buildingGroups[0]
      const group2 = buildingGroups[1]

      expect(group1.parts.OreIron).toBe(90)
      expect(group1.parts.IronIngot).toBe(90)
      expect(group2.parts.OreIron).toBe(60)
      expect(group2.parts.IronIngot).toBe(60)
    })
  })

  describe('rebalanceGroups', () => {
    let group1: ProductBuildingGroup
    let product: FactoryItem
    beforeEach(() => {
      product = mockFactory.products[0]
      addGroup(product)
      group1 = product.buildingGroups[0]
    })

    it('should apply an underclock to the group if the building count is not whole', () => {
      product.buildingRequirements.amount = 5.5

      rebalanceGroups(product)

      expect(group1.buildingCount).toBe(6)
      expect(group1.overclockPercent).toBe(83.333)
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
        addGroup(product)
        group2 = product.buildingGroups[1]
      })

      it('should distribute the building count evenly', () => {
        product.buildingRequirements.amount = 5

        rebalanceGroups(product)

        expect(group1.buildingCount).toBe(3)
        expect(group2.buildingCount).toBe(2)
      })

      it('should distribute the fractional group with an overclock', () => {
        product.buildingRequirements.amount = 3

        rebalanceGroups(product)

        expect(group1.buildingCount).toBe(2)
        expect(group2.buildingCount).toBe(1)

        expect(group1.overclockPercent).toBe(100)
        expect(group2.overclockPercent).toBe(150)
      })
    })
  })

  describe('calculateEffectiveBuildingCount', () => {
    let group1: ProductBuildingGroup
    let group2: ProductBuildingGroup
    let product: FactoryItem
    beforeEach(() => {
      product = mockFactory.products[0]
      addGroup(product)
      group1 = product.buildingGroups[0]
    })
    it('should properly calculate the effective building count across multiple groups', () => {
      addGroup(product)
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
      addGroup(product)
      addGroup(product)
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
})
