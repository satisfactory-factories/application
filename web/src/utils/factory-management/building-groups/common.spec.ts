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
  calculateBuildingGroupParts, calculateBuildingGroupProblems,
  calculateEffectiveBuildingCount, calculatePowerProducerBuildingGroupPower,
  calculateProductBuildingGroupPower,
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
      buildingAmount: 4,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Building,
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

  describe('factory calculations', () => {
    describe('rebalanceBuildingGroups', () => {
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

      describe('product', () => {
        beforeEach(() => {
          addProductBuildingGroup(product)
          calculateFactories(factories, gameData)
          group = product.buildingGroups[0]
        })

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

            // 30 (ore) * 1.5 (clock) = 45 (ore) * 10 (buildings) = 450
            expect(group.parts.OreIron).toBe(450)
            expect(group.parts.IronIngot).toBe(450)
          })

          it('should correctly apply a underclock to the parts', () => {
            group.buildingCount = 10
            group.overclockPercent = 50

            calculateBuildingGroupParts([product], GroupType.Product)

            // 30 (ore) * 0.5 (clock) = 15 (ore) * 10 (buildings) = 150
            expect(group.parts.OreIron).toBe(150)
            expect(group.parts.IronIngot).toBe(150)
          })

          it('should correctly apply an a clock with decimals', () => {
            group.buildingCount = 10
            group.overclockPercent = 133.3333

            calculateBuildingGroupParts([product], GroupType.Product)

            // 30 (ore) * 1.333333 (clock) = 39.9999 (ore) * 10 (buildings) = 399.999
            // 400 rounded
            expect(group.parts.OreIron).toBe(400)
            expect(group.parts.IronIngot).toBe(400)
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

            expect(group2.parts.OreCopper).toBe(31.883)
            expect(group2.parts.Water).toBe(21.255)
            expect(group2.parts.CopperIngot).toBe(79.706)

            // Test 3: 113.4933% overclock, testing to maximum precision
            group2.overclockPercent = 113.6666

            calculateBuildingGroupParts([mockFactory.products[1]], GroupType.Product)

            expect(group2.parts.OreCopper).toBe(17.05)
            expect(group2.parts.Water).toBe(11.367)
            expect(group2.parts.CopperIngot).toBe(42.625)
          })
        })
      })

      describe('power', () => {
        beforeEach(() => {
          addPowerProducerBuildingGroup(powerProducer)
          calculateFactories(factories, gameData)
          group = powerProducer.buildingGroups[0]
        })

        it('should calculate for a single group', () => {
        // Assert the before
          expect(group.parts.LiquidFuel).toBe(80)

          group.buildingCount = 8 // This should force a recalculation, originally it's 4

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.LiquidFuel).toBe(160)
        })

        it('should calculate for multiple groups', () => {
          addPowerProducerBuildingGroup(powerProducer, false)
          const group2 = powerProducer.buildingGroups[1]

          // Assert the before
          expect(group.parts.LiquidFuel).toBe(80)
          expect(group2.parts.LiquidFuel).toBe(0)

          group.buildingCount = 11.5
          group2.buildingCount = 5.5

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.LiquidFuel).toBe(230)
          expect(group2.parts.LiquidFuel).toBe(110)
        })

        it('should not adjust any clocks', () => {
        // Assert the before
          expect(group.overclockPercent).toBe(100)

          group.buildingCount = 11.5 // This requires 12 buildings and one at 50%

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.overclockPercent).toBe(100)
        })

        describe('overclocking', () => {
          it('should correctly apply an overclock to the parts', () => {
            group.buildingCount = 10
            group.overclockPercent = 150

            calculateBuildingGroupParts([powerProducer], GroupType.Power)

            // 20 (fuel) * 1.5 (150% OC) = 30 (fuel) * 10 (buildings) = 300 (fuel)
            expect(group.parts.LiquidFuel).toBe(300)
          })

          it('should correctly apply a underclock to the parts', () => {
            group.buildingCount = 10
            group.overclockPercent = 50

            calculateBuildingGroupParts([powerProducer], GroupType.Power)

            // 20 (fuel) * 0.5 (50% OC) = 10 (fuel) * 10 (buildings) = 100 (fuel)
            expect(group.parts.LiquidFuel).toBe(100)
          })

          it('should correctly apply an a clock with decimals', () => {
            group.buildingCount = 10
            group.overclockPercent = 133.3333

            calculateBuildingGroupParts([powerProducer], GroupType.Power)

            // 20 (fuel) * 1.33333 (133.3333% OC) = 26.666 (fuel) * 10 (buildings) = 266.666 (fuel)
            // 266.667 rounded
            expect(group.parts.LiquidFuel).toBe(266.667)
          })
        })
      })
    })

    describe('calculateBuildingGroupPower', () => {
      let mockFactory: Factory
      let product: FactoryItem
      let powerProducer: FactoryPowerProducer
      let group: BuildingGroup

      beforeEach(() => {
        mockFactory = newFactory('Iron Rods')
      })

      describe('product consumption', () => {
        beforeEach(() => {
          addProductToFactory(mockFactory, {
            id: 'IronRod',
            amount: 15,
            recipe: 'IronRod',
          })
          calculateFactories([mockFactory], gameData)
          product = mockFactory.products[0]
          group = product.buildingGroups[0]
          group.buildingCount = 1
        })

        describe('wiki example of iron rods', () => {
          it('should calculate a singular building correctly', () => {
            group.overclockPercent = 100
            calculateProductBuildingGroupPower(product.buildingGroups, product.buildingRequirements.name)
            expect(group.powerUsage).toBe(4)
          })

          it('should calculate a singular building with an underclock', () => {
            group.overclockPercent = 10
            calculateProductBuildingGroupPower(product.buildingGroups, product.buildingRequirements.name)
            expect(group.powerUsage).toBe(0.1906)

            group.overclockPercent = 50
            calculateProductBuildingGroupPower(product.buildingGroups, product.buildingRequirements.name)
            expect(group.powerUsage).toBe(1.6)
          })

          it('should calculate a singular building with an overclock', () => {
            group.overclockPercent = 150
            calculateProductBuildingGroupPower(product.buildingGroups, product.buildingRequirements.name)
            expect(group.powerUsage).toBe(6.8366)

            group.overclockPercent = 200
            calculateProductBuildingGroupPower(product.buildingGroups, product.buildingRequirements.name)
            expect(group.powerUsage).toBe(10)

            group.overclockPercent = 250
            calculateProductBuildingGroupPower(product.buildingGroups, product.buildingRequirements.name)
            expect(group.powerUsage).toBe(13.431)
          })
        })
      })

      describe('power producer generation', () => {
        beforeEach(() => {
          addPowerProducerToFactory(mockFactory, {
            building: 'generatorfuel',
            ingredientAmount: 80,
            recipe: 'GeneratorFuel_LiquidFuel',
            updated: FactoryPowerChangeType.Ingredient,
          })
          powerProducer = mockFactory.powerProducers[0]
          group = powerProducer.buildingGroups[0]
          calculateFactories([mockFactory], gameData)
        })

        it('should generate the expected power called directly', () => {
          group.buildingCount = 1
          group.overclockPercent = 100

          calculatePowerProducerBuildingGroupPower(
            powerProducer.buildingGroups,
            'GeneratorFuel_LiquidFuel',
          )

          expect(group.powerProduced).toBe(250)
        })

        it('should generate the expected power called via calculateFactories', () => {
          // Need to set it on a product level
          powerProducer.buildingAmount = 1
          powerProducer.updated = FactoryPowerChangeType.Building

          calculateFactories([mockFactory], gameData)

          expect(group.powerProduced).toBe(250)
        })

        it('should generate the expected power called via calculateFactories on fractionals', () => {
          // Need to set it on a product level
          powerProducer.buildingAmount = 1.5
          powerProducer.updated = FactoryPowerChangeType.Building

          calculateFactories([mockFactory], gameData)

          expect(group.powerProduced).toBe(375)
        })

        describe('wiki validated numbers, coal generator', () => {
          beforeEach(() => {
            mockFactory.powerProducers = []
            addPowerProducerToFactory(mockFactory, {
              building: 'generatorcoal',
              buildingAmount: 1,
              recipe: 'GeneratorCoal_Coal',
              updated: FactoryPowerChangeType.Building,
            })
            powerProducer = mockFactory.powerProducers[0]
            group = powerProducer.buildingGroups[0]
            calculateFactories([mockFactory], gameData)
          })

          it('should generate the expected amount of power, 100%', () => {
            expect(group.powerProduced).toBe(75)
          })

          it('should generate the expected amount of power, 10%', () => {
            group.overclockPercent = 10

            calculatePowerProducerBuildingGroupPower([group], 'GeneratorCoal_Coal')

            expect(group.powerProduced).toBe(7.5)
          })

          it('should generate the expected amount of power, 250%', () => {
            group.overclockPercent = 250

            calculatePowerProducerBuildingGroupPower([group], 'GeneratorCoal_Coal')

            expect(group.powerProduced).toBe(187.5)
          })
        })
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

describe('powerProducer simplified cases', async () => {
  let mockFactory: Factory
  let powerProducer: FactoryPowerProducer
  let group: BuildingGroup
  const gameData = await fetchGameData()

  beforeEach(() => {
    mockFactory = newFactory('Assuming full control')
  })

  describe('calculateBuildingGroupParts', () => {
    it('should calculate for a single group with calculateFactory', () => {
      addPowerProducerToFactory(mockFactory, {
        building: 'generatorfuel',
        fuelAmount: 100, // 5 buildings
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Fuel,
      })
      powerProducer = mockFactory.powerProducers[0]
      group = powerProducer.buildingGroups[0]
      calculateFactories([mockFactory], gameData)

      // Set the producer's building count to 10, which should update the group as well
      powerProducer.buildingAmount = 10 // 200 fuel total
      powerProducer.updated = FactoryPowerChangeType.Building

      calculateFactories([mockFactory], gameData)

      expect(powerProducer.ingredients[0].perMin).toBe(200)
      expect(group.parts.LiquidFuel).toBe(200)
    })

    it('should calculate for a single group with multiple parts via calculateFactory', () => {
      mockFactory.powerProducers = []
      addPowerProducerToFactory(mockFactory, {
        building: 'generatorcoal',
        fuelAmount: 30, // 2 buildings
        recipe: 'GeneratorCoal_Coal',
        updated: FactoryPowerChangeType.Fuel,
      })
      powerProducer = mockFactory.powerProducers[0]
      group = powerProducer.buildingGroups[0]
      calculateFactories([mockFactory], gameData)

      // Set the producer's building count to 10, which should update the group as well
      powerProducer.buildingAmount = 1 // 200 fuel total
      powerProducer.updated = FactoryPowerChangeType.Building

      calculateFactories([mockFactory], gameData)

      expect(powerProducer.ingredients[0].perMin).toBe(15)
      expect(powerProducer.ingredients[1].perMin).toBe(45)
      expect(group.parts.Coal).toBe(15)
      expect(group.parts.Water).toBe(45)
    })

    // https://satisfactory.wiki.gg/wiki/Clock_speed#Clock_speed_for_power_generators
    describe('ingredient scaling', () => {
      describe('coal generators - ingame validated', () => {
        beforeEach(() => {
          mockFactory.powerProducers = []
          addPowerProducerToFactory(mockFactory, {
            building: 'generatorcoal',
            buildingAmount: 1,
            recipe: 'GeneratorCoal_Coal',
            updated: FactoryPowerChangeType.Building,
          })
          powerProducer = mockFactory.powerProducers[0]
          group = powerProducer.buildingGroups[0]
          calculateFactories([mockFactory], gameData)
        })

        it('should correctly scale ingredients based on an overclock', () => {
          group.overclockPercent = 150

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(22.5)
          expect(group.parts.Water).toBe(67.5) // Ingame 68, seems the game rounds it to 0 decimals

          group.overclockPercent = 222.2222

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(33.333)
          expect(group.parts.Water).toBe(100)
        })

        it('should correctly scale ingredients based on an underclock', () => {
          group.overclockPercent = 55.223

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(8.283) // 8.28 in game
          expect(group.parts.Water).toBe(24.85) // Ingame 25, game rounds it up

          group.overclockPercent = 13.37

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(2.005) // 2.01 in game
          expect(group.parts.Water).toBe(6.017) // Ingame 6, game rounds it
        })

        it('should correctly scale ingredients when multiple buildings are involved', () => {
          // Start off at 100% clock
          group.buildingCount = 5

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(75)
          expect(group.parts.Water).toBe(225)

          group.overclockPercent = 150

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(112.5)
          expect(group.parts.Water).toBe(337.5)

          group.overclockPercent = 55

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(41.25)
          expect(group.parts.Water).toBe(123.75)
        })
      })

      describe('fuel generators - ingame validated', () => {
        beforeEach(() => {
          mockFactory.powerProducers = []
          addPowerProducerToFactory(mockFactory, {
            building: 'generatorfuel',
            buildingAmount: 1, // 2 buildings
            recipe: 'GeneratorFuel_LiquidFuel',
            updated: FactoryPowerChangeType.Building,
          })
          powerProducer = mockFactory.powerProducers[0]
          group = powerProducer.buildingGroups[0]
          calculateFactories([mockFactory], gameData)
        })

        it('should correctly scale ingredients based on an overclock', () => {
          group.overclockPercent = 150

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(22.5)
          expect(group.parts.Water).toBe(67.5) // Ingame 68, seems the game rounds it to 0 decimals

          group.overclockPercent = 222.2222

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(33.333)
          expect(group.parts.Water).toBe(100)
        })

        it('should correctly scale ingredients based on an underclock', () => {
          group.overclockPercent = 55.223

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(8.283) // 8.28 in game
          expect(group.parts.Water).toBe(24.85) // Ingame 25, game rounds it up

          group.overclockPercent = 13.37

          calculateBuildingGroupParts([powerProducer], GroupType.Power)

          expect(group.parts.Coal).toBe(2.005) // 2.01 in game
          expect(group.parts.Water).toBe(6.017) // Ingame 6, game rounds it
        })
      })
    })
  })
})
