import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, ProductBuildingGroup } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addGroup } from '@/utils/factory-management/productBuildingGroups'
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
})
