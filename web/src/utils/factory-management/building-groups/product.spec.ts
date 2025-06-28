import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BuildingGroup, Factory, FactoryItem, ItemType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import {
  addProductBuildingGroup,
  buildingsNeededForPartsProducts,
} from '@/utils/factory-management/building-groups/product'
import {
  addBuildingGroup,
  calculateBuildingGroupParts,
  remainderToLast,
  remainderToNewGroup,
} from '@/utils/factory-management/building-groups/common'
import { addProductToFactory } from '@/utils/factory-management/products'
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
  let buildingGroups: BuildingGroup[]
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

  describe('addProductBuildingGroup', () => {
    it('should add a new group to the product with the correct building count', () => {
      addProductBuildingGroup(mockFactory.products[0], mockFactory)

      expect(buildingGroups.length).toBe(1)
      expect(buildingGroups[0].buildingCount).toBe(5)
    })

    it('should add a new group to the product with 0 buildings', () => {
      addProductBuildingGroup(mockFactory.products[0], mockFactory)

      expect(buildingGroups[0].buildingCount).toBe(0)
    })

    it('should add multiple groups each containing the correct part amounts', () => {
      addProductBuildingGroup(mockFactory.products[0], mockFactory, true) // The first group should contain the full requirement
      addProductBuildingGroup(mockFactory.products[0], mockFactory)

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

  describe('remainder handling', () => {
    let group1: BuildingGroup
    let group2: BuildingGroup
    let product: FactoryItem
    beforeEach(() => {
      product = mockFactory.products[0]
      addBuildingGroup(product, ItemType.Product, mockFactory)
      addBuildingGroup(product, ItemType.Product, mockFactory)

      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]
    })

    describe('remainderToLast', () => {
      it('should properly add the remainder to the last group when a full number', () => {
        product.buildingRequirements.amount = 5

        group1.buildingCount = 3
        group2.buildingCount = 1 // Missing 1

        remainderToLast(product, ItemType.Product, mockFactory)

        expect(group1.buildingCount).toBe(3)
        expect(group1.overclockPercent).toBe(100)
        expect(group2.buildingCount).toBe(2)
        expect(group2.overclockPercent).toBe(100)
      })

      it('should properly add the remainder to the last group when not a full number', () => {
        product.buildingRequirements.amount = 131.1

        group1.buildingCount = 131
        group2.buildingCount = 1 // Which will need a 10% overclock

        remainderToLast(product, ItemType.Product, mockFactory)

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

        remainderToLast(product, ItemType.Product, mockFactory)

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

        remainderToLast(product, ItemType.Product, mockFactory)

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

        remainderToNewGroup(product, ItemType.Product, mockFactory)

        expect(product.buildingGroups.length).toBe(3)
        expect(product.buildingGroups[2].buildingCount).toBe(1)
        expect(product.buildingGroups[2].overclockPercent).toBe(100)
      })

      it('should properly add the remainder to a new group when a fractional', () => {
        product.buildingRequirements.amount = 5.5

        group1.buildingCount = 3
        group2.buildingCount = 2 // Missing 0.5

        remainderToNewGroup(product, ItemType.Product, mockFactory)

        expect(product.buildingGroups.length).toBe(3)
        expect(product.buildingGroups[2].buildingCount).toBe(1)
        expect(product.buildingGroups[2].overclockPercent).toBe(50)
      })

      it('should do nothing when the remainder is negative', () => {
        product.buildingRequirements.amount = 5.5

        group1.buildingCount = 3
        group2.buildingCount = 3 // 0.5 too many

        remainderToNewGroup(product, ItemType.Product, mockFactory)

        expect(product.buildingGroups.length).toBe(2)
      })
    })
  })

  describe('overclocking', () => {
    let factory: Factory
    let factories: Factory[]
    let group1: BuildingGroup
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

      calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

      expect(group1.parts.OreCopper).toBe(45)
      expect(group1.parts.CopperIngot).toBe(45)
    })

    describe('clocking with in-game validated numbers', () => {
      let overclockedFactory: Factory
      let copperIngots: FactoryItem
      let plastic: FactoryItem
      let copperIngotsGroup: BuildingGroup
      let plasticGroup: BuildingGroup

      beforeEach(() => {
        overclockedFactory = newFactory('Test Overclocking Factory')
      })

      describe('refineries', () => {
        beforeEach(() => {
          addProductToFactory(overclockedFactory, {
            id: 'CopperIngot',
            amount: 123,
            recipe: 'Alternate_PureCopperIngot',
          })
          copperIngots = overclockedFactory.products[0]
          copperIngotsGroup = copperIngots.buildingGroups[0]
          copperIngotsGroup.buildingCount = 1
          addProductBuildingGroup(copperIngots, mockFactory, false) // Puts it into advanced mode
          copperIngots.buildingGroups[1].buildingCount = 0 // Force the 2nd group to be 0

          addProductToFactory(overclockedFactory, {
            id: 'Plastic',
            amount: 123,
            recipe: 'Plastic',
          })
          plastic = overclockedFactory.products[1]
          plasticGroup = plastic.buildingGroups[0]
          plasticGroup.buildingCount = 1

          calculateFactories([overclockedFactory], gameData)
        })

        it('should correctly overclock a pure copper ingot recipe', () => {
          copperIngotsGroup.overclockPercent = 137.4667

          calculateFactories([overclockedFactory], gameData)

          expect(copperIngotsGroup.parts.CopperIngot).toBe(51.55)
          expect(copperIngotsGroup.parts.OreCopper).toBe(20.62)
          expect(copperIngotsGroup.parts.Water).toBe(13.747)
        })

        it('should correctly underclock a pure copper ingot recipe', () => {
          copperIngotsGroup.overclockPercent = 55.533

          calculateFactories([overclockedFactory], gameData)

          expect(copperIngotsGroup.parts.CopperIngot).toBe(20.825)
          expect(copperIngotsGroup.parts.OreCopper).toBe(8.33)
          expect(copperIngotsGroup.parts.Water).toBe(5.553)
        })

        it('should correctly overclock a plastic recipe', () => {
          plasticGroup.overclockPercent = 189.5

          calculateFactories([overclockedFactory], gameData)

          expect(plasticGroup.parts.Plastic).toBe(37.9)
          expect(plasticGroup.parts.LiquidOil).toBe(56.85)
          expect(plasticGroup.parts.HeavyOilResidue).toBe(18.95)
        })

        it('should correctly underclock a plastic recipe', () => {
          plasticGroup.overclockPercent = 62.55

          calculateFactories([overclockedFactory], gameData)

          expect(plasticGroup.parts.Plastic).toBe(12.51)
          expect(plasticGroup.parts.LiquidOil).toBe(18.765)
          expect(plasticGroup.parts.HeavyOilResidue).toBe(6.255)
        })
      })

      describe('manufacturer', () => {
        let product: FactoryItem
        let group: BuildingGroup
        beforeEach(() => {
          addProductToFactory(overclockedFactory, {
            id: 'SpaceElevatorPart_5', // Adaptive Control Unit
            amount: 1, // 100% OC, building count 1
            recipe: 'SpaceElevatorPart_5',
          })

          product = overclockedFactory.products[0]
          group = product.buildingGroups[0]
        })

        it('should correctly overclock a ACU recipe', () => {
          group.overclockPercent = 143.3333

          calculateFactories([overclockedFactory], gameData)

          expect(group.parts.SpaceElevatorPart_5).toBe(1.433)
          expect(group.parts.SpaceElevatorPart_3).toBe(7.167) // Automated Wiring
          expect(group.parts.CircuitBoard).toBe(7.167)
          expect(group.parts.ModularFrameHeavy).toBe(1.433)
          expect(group.parts.Computer).toBe(2.867)
        })

        it('should correctly underclock a ACU recipe', () => {
          group.overclockPercent = 63.656

          calculateFactories([overclockedFactory], gameData)

          expect(group.parts.SpaceElevatorPart_5).toBe(0.637)
          expect(group.parts.SpaceElevatorPart_3).toBe(3.183) // Automated Wiring
          expect(group.parts.CircuitBoard).toBe(3.183)
          expect(group.parts.ModularFrameHeavy).toBe(0.637)
          expect(group.parts.Computer).toBe(1.273)
        })
      })
    })
  })

  describe('buildingsNeededForPart', () => {
    let group: BuildingGroup
    let groupComplex: BuildingGroup
    let product: FactoryItem
    let complexProduct: FactoryItem

    beforeEach(() => {
      product = mockFactory.products[0]

      addProductToFactory(mockFactory, {
        id: 'Battery',
        amount: 20, // OC 100%
        recipe: 'Battery',
      })
      complexProduct = mockFactory.products[1]
      addBuildingGroup(product, ItemType.Product, mockFactory)
      addProductBuildingGroup(complexProduct, mockFactory)
      group = product.buildingGroups[0]
      groupComplex = complexProduct.buildingGroups[0]
    })

    it('should calculate for an ingredient part', () => {
      expect(buildingsNeededForPartsProducts('OreIron', 150, product, group)).toBe(5)
    })

    it('should calculate for an ingredient part which results in a fractional', () => {
      expect(buildingsNeededForPartsProducts('OreIron', 555.554, product, group)).toBe(18.518)
    })

    it('should calculate for an product part', () => {
      expect(buildingsNeededForPartsProducts('IronIngot', 150, product, group)).toBe(5)
    })

    it('should calculate for a byproduct part, and return a fractional', () => {
      expect(buildingsNeededForPartsProducts('Water', 43.5, complexProduct, groupComplex)).toBe(1.45)
    })

    it('should calculate for a secondary input part', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 195, // This makes the OC 100%
        recipe: 'Alternate_PureIronIngot',
      })
      const product2 = mockFactory.products[2]
      const group2 = product2.buildingGroups[0]
      expect(buildingsNeededForPartsProducts('Water', 40, product2, group2)).toBe(2)
      expect(buildingsNeededForPartsProducts('Water', 46.154, product2, group2)).toBe(2.308)
    })
  })
})
