import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer,
  ItemType,
} from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import { beforeEach, describe, expect, it } from 'vitest'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory, increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
import {
  addBuildingGroup,
  bestEffortUpdateBuildingCount,
  calculateBuildingGroupParts,
  calculateBuildingGroupProblems,
  calculateEffectiveBuildingCount,
  calculatePowerProducerBuildingGroupPower,
  calculateProductBuildingGroupPower,
  calculateRemainingBuildingCount,
  checkForItemUpdate,
  deleteBuildingGroup,
  syncBuildingGroups,
  toggleBuildingGroupTray,
  updateBuildingGroupViaPart,
} from '@/utils/factory-management/building-groups/common'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'

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

    productBuildingGroups = product.buildingGroups
    powerBuildingGroups = mockFactory.powerProducers[0].buildingGroups
  })

  describe('addBuildingGroup', () => {
    describe('products', () => {
      beforeEach(() => {
        product.buildingGroups = []
      })

      it('should add an initial product group, and be correctly configured', () => {
        addBuildingGroup(product, ItemType.Product, mockFactory)

        const group = product.buildingGroups[0]

        expect(group.type).toBe(ItemType.Product)
        expect(group.buildingCount).toBe(5)
        expect(group.overclockPercent).toBe(100)

        // Parts
        expect(group.parts.OreIron).toBe(150)
        expect(group.parts.IronIngot).toBe(150)
      })

      it('should add a second product group and have zeroed metrics / buildings', () => {
        addBuildingGroup(product, ItemType.Product, mockFactory)
        addBuildingGroup(product, ItemType.Product, mockFactory)

        const group = product.buildingGroups[1]

        expect(product.buildingGroups.length).toBe(2)
        expect(group.buildingCount).toBe(0)

        // Parts
        expect(group.parts.OreIron).toBe(0)
        expect(group.parts.IronIngot).toBe(0)
      })
    })

    describe('power producers', () => {
      beforeEach(() => {
        powerProducer.buildingGroups = []
      })

      it('should add an initial power producer group, and should be correct', () => {
        addBuildingGroup(powerProducer, ItemType.Power, mockFactory)

        const group = powerProducer.buildingGroups[0]

        expect(powerBuildingGroups.length).toBe(1)
        expect(group.type).toBe(ItemType.Power)
        expect(group.buildingCount).toBe(4)
        expect(group.overclockPercent).toBe(100)

        // Parts
        expect(group.parts.LiquidFuel).toBe(80)
      })

      it('should add a second power producer group, and should be correct', () => {
        addBuildingGroup(powerProducer, ItemType.Power, mockFactory)
        addBuildingGroup(powerProducer, ItemType.Power, mockFactory)

        const group = powerProducer.buildingGroups[1]

        expect(group.buildingCount).toBe(0)
        expect(group.overclockPercent).toBe(100)

        // Parts
        expect(group.parts.LiquidFuel).toBe(0)
      })
    })
  })

  describe('factory calculations', () => {
    describe('syncBuildingGroups', () => {
      let group1: BuildingGroup

      beforeEach(() => {
        addBuildingGroup(product, ItemType.Product, mockFactory)
        group1 = product.buildingGroups[0]

        calculateFactories(factories, gameData)
      })

      describe('products', () => {
        it('should apply an underclock to the group if the building count is not whole', () => {
          product.buildingRequirements.amount = 5.5

          syncBuildingGroups(product, ItemType.Product, mockFactory)

          expect(group1.buildingCount).toBe(6)
          expect(group1.overclockPercent).toBe(91.667) // 6 * 0.91667 = 5.5
        })

        it('should apply an underclock to the group if the building count is not whole', () => {
          product.buildingRequirements.amount = 5.7

          syncBuildingGroups(product, ItemType.Product, mockFactory)

          expect(group1.buildingCount).toBe(6)
          expect(group1.overclockPercent).toBe(95) // 6 * 0.95 = 5.7
        })

        it('should apply no clock changes on whole buildings', () => {
          product.buildingRequirements.amount = 4

          syncBuildingGroups(product, ItemType.Product, mockFactory)

          expect(group1.buildingCount).toBe(4)
          expect(group1.overclockPercent).toBe(100)
        })

        describe('multiple groups', () => {
          let group2: BuildingGroup

          beforeEach(() => {
            addBuildingGroup(product, ItemType.Product, mockFactory)
            group2 = product.buildingGroups[1]
          })

          it('should not rebalance when in advanced mode and not forced', () => {
            // Assert the before
            expect(group1.buildingCount).toBe(5)
            expect(group2.buildingCount).toBe(5)
            product.buildingRequirements.amount = 20

            syncBuildingGroups(product, ItemType.Product, mockFactory)

            // Nothing should have changed
            expect(group1.buildingCount).toBe(5)
            expect(group2.buildingCount).toBe(5)
          })

          it('should distribute the building count evenly', () => {
            product.buildingRequirements.amount = 6

            syncBuildingGroups(product, ItemType.Product, mockFactory, { force: true })

            expect(group1.buildingCount).toBe(3)
            expect(group2.buildingCount).toBe(3)
          })

          it('should distribute the building count evenly with odd numbers resulting in an underclock', () => {
            product.buildingRequirements.amount = 5

            syncBuildingGroups(product, ItemType.Product, mockFactory, { force: true })

            expect(group1.buildingCount).toBe(3)
            expect(group2.buildingCount).toBe(3)

            expect(group1.overclockPercent).toBe(83.333)
            expect(group2.overclockPercent).toBe(83.333)
          })

          it('should distribute the fractional group with an underclock', () => {
            product.buildingRequirements.amount = 3

            syncBuildingGroups(product, ItemType.Product, mockFactory, { force: true })

            expect(group1.buildingCount).toBe(2)
            expect(group2.buildingCount).toBe(2)

            expect(group1.overclockPercent).toBe(75)
            expect(group2.overclockPercent).toBe(75)
          })

          it('should distribute and update the resources correctly', () => {
            product.buildingRequirements.amount = 4
            increaseProductQtyViaBuilding(product, mockFactory, gameData)// Ensure it needs 4 buildings

            // Recalculate
            calculateFactories(factories, gameData)

            // Set the initial values, group 2 purposefully unbalanced
            group1.buildingCount = 2
            group2.buildingCount = 3

            // Calculate, it should be properly imbalanced
            calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

            expect(group2.parts.OreIron).toBe(90)
            expect(group2.parts.IronIngot).toBe(90)

            // Now rebalance and recalculate, it should distribute evenly.
            syncBuildingGroups(product, ItemType.Product, mockFactory, { force: true })

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
          addBuildingGroup(product, ItemType.Product, mockFactory)
          calculateFactories(factories, gameData)
          group = product.buildingGroups[0]
        })

        it('should calculate for a single group', () => {
        // Assert the before
          expect(group.parts.OreIron).toBe(150)
          expect(group.parts.IronIngot).toBe(150)

          group.buildingCount = 10 // This should force a recalculation, originally it's 5

          calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

          expect(group.parts.OreIron).toBe(300)
          expect(group.parts.IronIngot).toBe(300)
        })

        it('should calculate for multiple groups', () => {
          addBuildingGroup(product, ItemType.Product, mockFactory)
          const group2 = product.buildingGroups[1]

          // Assert the before
          expect(group.parts.OreIron).toBe(150)
          expect(group2.parts.OreIron).toBe(0)
          expect(group.parts.IronIngot).toBe(150)
          expect(group2.parts.IronIngot).toBe(0)

          group.buildingCount = 11.5
          group2.buildingCount = 5.5

          calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

          expect(group.parts.OreIron).toBe(345)
          expect(group.parts.IronIngot).toBe(345)
          expect(group2.parts.OreIron).toBe(165)
          expect(group2.parts.IronIngot).toBe(165)
        })

        it('should not adjust any clocks', () => {
        // Assert the before
          expect(group.overclockPercent).toBe(100)

          group.buildingCount = 11.5 // This requires 12 buildings and one at 50%

          calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

          expect(group.overclockPercent).toBe(100)
        })

        it('should calculate ALL parts of a product', () => {
          mockFactory.products = []
          addProductToFactory(mockFactory, {
            id: 'AlienPowerFuel',
            amount: 2, // 0.8 buildings
            recipe: 'AlienPowerFuel',
          })
          product = mockFactory.products[0]
          group = mockFactory.products[0].buildingGroups[0]
          calculateFactories([mockFactory], gameData)

          expect(group.parts.AlienPowerFuel).toBe(2) // Product
          expect(group.parts.DarkEnergy).toBe(48) // Byproduct AND ingredient
          expect(group.parts.SAMFluctuator).toBe(10) // Ingredient
          expect(group.parts.CrystalShard).toBe(6) // Ingredient
          expect(group.parts.QuantumOscillator).toBe(6) // Ingredient
          expect(group.parts.QuantumEnergy).toBe(48) // Ingredient aka Excited Photonic

          group.buildingCount = 10 // This forces a recalculation
          group.overclockPercent = 100

          calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

          expect(group.overclockPercent).toBe(100)
          expect(group.parts.AlienPowerFuel).toBe(25) // Product
          expect(group.parts.DarkEnergy).toBe(600) // Byproduct AND ingredient
          expect(group.parts.SAMFluctuator).toBe(125) // Ingredient
          expect(group.parts.CrystalShard).toBe(75) // Ingredient
          expect(group.parts.QuantumOscillator).toBe(75) // Ingredient
          expect(group.parts.QuantumEnergy).toBe(600) // Ingredient aka Excited Photonic
        })

        describe('overclocking', () => {
          it('should correctly apply an overclock to the parts', () => {
            group.buildingCount = 10
            group.overclockPercent = 150

            calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

            // 30 (ore) * 1.5 (clock) = 45 (ore) * 10 (buildings) = 450
            expect(group.parts.OreIron).toBe(450)
            expect(group.parts.IronIngot).toBe(450)
          })

          it('should correctly apply a underclock to the parts', () => {
            group.buildingCount = 10
            group.overclockPercent = 50

            calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

            // 30 (ore) * 0.5 (clock) = 15 (ore) * 10 (buildings) = 150
            expect(group.parts.OreIron).toBe(150)
            expect(group.parts.IronIngot).toBe(150)
          })

          it('should correctly apply an a clock with decimals', () => {
            group.buildingCount = 10
            group.overclockPercent = 133.3333

            calculateBuildingGroupParts([product], ItemType.Product, mockFactory)

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

            addBuildingGroup(mockFactory.products[1], ItemType.Product, mockFactory)
            addBuildingGroup(mockFactory.products[1], ItemType.Product, mockFactory) // Puts it in advanced mode
            const group2 = mockFactory.products[1].buildingGroups[0]

            // Test 1: 150% overclock
            group2.buildingCount = 1
            group2.overclockPercent = 150

            calculateBuildingGroupParts([mockFactory.products[1]], ItemType.Product, mockFactory)

            expect(group2.parts.OreCopper).toBe(22.5)
            expect(group2.parts.Water).toBe(15)
            expect(group2.parts.CopperIngot).toBe(56.25)

            // Test 2: 212.55% overclock, also testing the precision of the parts
            group2.overclockPercent = 212.55

            calculateBuildingGroupParts([mockFactory.products[1]], ItemType.Product, mockFactory)

            expect(group2.parts.OreCopper).toBe(31.883)
            expect(group2.parts.Water).toBe(21.255)
            expect(group2.parts.CopperIngot).toBe(79.706)

            // Test 3: 113.4933% overclock, testing to maximum precision
            group2.overclockPercent = 113.6666

            calculateBuildingGroupParts([mockFactory.products[1]], ItemType.Product, mockFactory)

            expect(group2.parts.OreCopper).toBe(17.05)
            expect(group2.parts.Water).toBe(11.367)
            expect(group2.parts.CopperIngot).toBe(42.625)
          })
        })
      })

      describe('power', () => {
        beforeEach(() => {
          addPowerProducerBuildingGroup(powerProducer, mockFactory)
          calculateFactories(factories, gameData)
          group = powerProducer.buildingGroups[0]
        })

        it('should calculate for a single group', () => {
        // Assert the before
          expect(group.parts.LiquidFuel).toBe(80)

          group.buildingCount = 8 // This should force a recalculation, originally it's 4

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.LiquidFuel).toBe(160)
        })

        it('should calculate for multiple groups', () => {
          addPowerProducerBuildingGroup(powerProducer, mockFactory, false)
          const group2 = powerProducer.buildingGroups[1]

          // Assert the before
          expect(group.parts.LiquidFuel).toBe(80)
          expect(group2.parts.LiquidFuel).toBe(0)

          group.buildingCount = 11.5
          group2.buildingCount = 5.5

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.LiquidFuel).toBe(230)
          expect(group2.parts.LiquidFuel).toBe(110)
        })

        it('should not adjust any clocks', () => {
        // Assert the before
          expect(group.overclockPercent).toBe(100)

          group.buildingCount = 11.5 // This requires 12 buildings and one at 50%

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.overclockPercent).toBe(100)
        })

        describe('overclocking', () => {
          it('should correctly apply an overclock to the parts', () => {
            group.buildingCount = 10
            group.overclockPercent = 150

            calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

            // 20 (fuel) * 1.5 (150% OC) = 30 (fuel) * 10 (buildings) = 300 (fuel)
            expect(group.parts.LiquidFuel).toBe(300)
          })

          it('should correctly apply a underclock to the parts', () => {
            group.buildingCount = 10
            group.overclockPercent = 50

            calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

            // 20 (fuel) * 0.5 (50% OC) = 10 (fuel) * 10 (buildings) = 100 (fuel)
            expect(group.parts.LiquidFuel).toBe(100)
          })

          it('should correctly apply an a clock with decimals', () => {
            group.buildingCount = 10
            group.overclockPercent = 133.3333

            calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

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

        describe('in game validated, fuel generator', () => {
          beforeEach(() => {
            mockFactory.powerProducers = []
            addPowerProducerToFactory(mockFactory, {
              building: 'generatorfuel',
              buildingAmount: 1,
              recipe: 'GeneratorFuel_LiquidFuel',
              updated: FactoryPowerChangeType.Building,
            })
            powerProducer = mockFactory.powerProducers[0]
            group = powerProducer.buildingGroups[0]
            calculateFactories([mockFactory], gameData)
          })

          it('should generate the expected amount of power, 100%', () => {
            expect(group.powerProduced).toBe(250)
          })

          it('should generate the expected amount of power, 10%', () => {
            group.overclockPercent = 10

            calculatePowerProducerBuildingGroupPower([group], 'GeneratorFuel_LiquidFuel')

            expect(group.powerProduced).toBe(25)
          })

          it('should generate the expected amount of power, 250%', () => {
            group.overclockPercent = 250

            calculatePowerProducerBuildingGroupPower([group], 'GeneratorFuel_LiquidFuel')

            expect(group.powerProduced).toBe(625)
          })

          it('should generate the expected amount of power, 222.2222%', () => {
            group.overclockPercent = 222.2222

            calculatePowerProducerBuildingGroupPower([group], 'GeneratorFuel_LiquidFuel')

            expect(group.powerProduced).toBe(555.5555) // 555.56 in game
          })
        })
      })
    })

    describe('calculateBuildingGroupProblems', () => {
      let group1: BuildingGroup
      let group2: BuildingGroup

      beforeEach(() => {
        addBuildingGroup(product, ItemType.Product, mockFactory)
        addBuildingGroup(product, ItemType.Product, mockFactory)
        group1 = product.buildingGroups[0]
        group2 = product.buildingGroups[1]
      })

      it('should correctly identify when a building group has a problem', () => {
      // Lower the effective building count from 5 to 4
        group1.buildingCount = 1
        group2.buildingCount = 3

        calculateBuildingGroupProblems(product, ItemType.Product)

        expect(product.buildingGroupsHaveProblem).toBe(true)
      })

      it('should remove the problem flag when it has been resolved', () => {
      // Lower the effective building count from 5 to 4
        group1.buildingCount = 1
        group2.buildingCount = 3

        calculateBuildingGroupProblems(product, ItemType.Product)

        expect(product.buildingGroupsHaveProblem).toBe(true)

        // Now fix the problem
        group1.buildingCount = 2
        group2.buildingCount = 3

        calculateBuildingGroupProblems(product, ItemType.Product)

        expect(product.buildingGroupsHaveProblem).toBe(false)
      })
    })

    describe('checkForItemUpdate', () => {
      it('should increase the product\'s quantity if it is a singular building group', () => {
        productBuildingGroups[0].buildingCount = 10

        checkForItemUpdate(product, mockFactory)

        expect(product.buildingRequirements.amount).toBe(10)
        expect(product.amount).toBe(300)
      })

      it('should increase the product\'s quantity if it is a singular building group, via calculateFactories', () => {
        productBuildingGroups[0].buildingCount = 10

        calculateFactories(factories, gameData)

        expect(product.buildingRequirements.amount).toBe(10)
        expect(product.amount).toBe(300)
      })

      it('should NOT increase the product\'s quantity if it is multiple building groups', () => {
        addBuildingGroup(product, ItemType.Product, mockFactory)
        productBuildingGroups[0].buildingCount = 1337

        checkForItemUpdate(product, mockFactory)

        expect(product.buildingRequirements.amount).toBe(5)
        expect(product.amount).toBe(150)
      })

      it('should update the product\'s quantity if the clock has been changed', () => {
        productBuildingGroups[0].buildingCount = 1
        productBuildingGroups[0].overclockPercent = 50

        checkForItemUpdate(product, mockFactory)

        expect(product.amount).toBe(15)
      })

      // In this context if the user is intentionally overclocking we'd prefer it to respect the building count.
      it('should respect the user\'s overclock and keep it to the same building, but updating the product quantity, when a singular group', () => {
        productBuildingGroups[0].buildingCount = 1
        productBuildingGroups[0].overclockPercent = 200

        checkForItemUpdate(product, mockFactory)

        expect(product.buildingRequirements.amount).toBe(1)
        expect(product.amount).toBe(45)
      })

      it('should make no changes to product quantity when multiple groups and overclocking', () => {
        addBuildingGroup(product, ItemType.Product, mockFactory)
        productBuildingGroups[0].overclockPercent = 200

        checkForItemUpdate(product, mockFactory)

        expect(product.buildingRequirements.amount).toBe(5)
        expect(product.amount).toBe(150)
      })

      it('should increase the power producer\'s building amount if it is a singular building group', () => {
        powerBuildingGroups[0].buildingCount = 10

        checkForItemUpdate(powerProducer, mockFactory)

        expect(powerProducer.buildingAmount).toBe(10)
        expect(powerProducer.buildingCount).toBe(10)
      })

      it('should increase the power producer\'s building amount if it is a singular building group when calculated', () => {
        powerProducer.buildingGroupItemSync = true
        powerBuildingGroups[0].buildingCount = 10

        calculateFactories([mockFactory], gameData)

        expect(powerProducer.powerProduced).toBe(2500)
      })
    })
  })

  describe('calculateEffectiveBuildingCount', () => {
    let group1: BuildingGroup
    let group2: BuildingGroup

    beforeEach(() => {
      addBuildingGroup(product, ItemType.Product, mockFactory)
      group1 = product.buildingGroups[0]
    })

    it('should properly calculate the effective building count across multiple groups', () => {
      addBuildingGroup(product, ItemType.Product, mockFactory)
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
      addBuildingGroup(product, ItemType.Product, mockFactory)
      addBuildingGroup(product, ItemType.Product, mockFactory)
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

  describe('calculateRemainingBuildingCount', () => {
    let group1: BuildingGroup
    let group2: BuildingGroup

    beforeEach(() => {
      addBuildingGroup(product, ItemType.Product, mockFactory)
      addBuildingGroup(product, ItemType.Product, mockFactory)
      group1 = product.buildingGroups[0]
      group2 = product.buildingGroups[1]
    })

    it('should calculate the remaining building count correctly', () => {
      // Make it so there's an effective 10 buildings, zero buildings on the product
      group1.buildingCount = 4
      group2.buildingCount = 6

      expect(calculateRemainingBuildingCount(product, ItemType.Product)).toBe(-10)

      // Give the product some buildings
      product.buildingRequirements.amount = 10

      // It should equalize
      expect(calculateRemainingBuildingCount(product, ItemType.Product)).toBe(0)

      // Make the groups short
      product.buildingRequirements.amount = 20

      expect(calculateRemainingBuildingCount(product, ItemType.Product)).toBe(10)
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

  describe('deleteBuildingGroup', () => {
    it('should prevent deleting the only group remaining', () => {
      deleteBuildingGroup(product, product.buildingGroups[0])
      expect(product.buildingGroups.length).toBe(1)
    })

    it('should delete a building group', () => {
      addBuildingGroup(product, ItemType.Product, mockFactory)

      const group2Id = product.buildingGroups[1].id

      deleteBuildingGroup(product, product.buildingGroups[0])
      expect(product.buildingGroups.length).toBe(1)
      expect(product.buildingGroups[0].id).toBe(group2Id)
    })

    it('should delete a building group and set building group sync to enabled', () => {
      addBuildingGroup(product, ItemType.Product, mockFactory) // Sync should be disabled by this
      expect(product.buildingGroupItemSync).toBe(false)

      deleteBuildingGroup(product, product.buildingGroups[0])
      expect(product.buildingGroups.length).toBe(1)
      expect(product.buildingGroupItemSync).toBe(true)
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

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.Coal).toBe(22.5)
          expect(group.parts.Water).toBe(67.5) // Ingame 68, seems the game rounds it to 0 decimals

          group.overclockPercent = 222.2222

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.Coal).toBe(33.333)
          expect(group.parts.Water).toBe(100)
        })

        it('should correctly scale ingredients based on an underclock', () => {
          group.overclockPercent = 55.223

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.Coal).toBe(8.283) // 8.28 in game
          expect(group.parts.Water).toBe(24.85) // Ingame 25, game rounds it up

          group.overclockPercent = 13.37

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.Coal).toBe(2.005) // 2.01 in game
          expect(group.parts.Water).toBe(6.017) // Ingame 6, game rounds it
        })

        it('should correctly scale ingredients when multiple buildings are involved', () => {
          // Start off at 100% clock
          group.buildingCount = 5

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.Coal).toBe(75)
          expect(group.parts.Water).toBe(225)

          group.overclockPercent = 150

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.Coal).toBe(112.5)
          expect(group.parts.Water).toBe(337.5)

          group.overclockPercent = 55

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.Coal).toBe(41.25)
          expect(group.parts.Water).toBe(123.75)
        })
      })

      describe('fuel generators - ingame validated', () => {
        beforeEach(() => {
          mockFactory.powerProducers = []
          addPowerProducerToFactory(mockFactory, {
            building: 'generatorfuel',
            buildingAmount: 1,
            recipe: 'GeneratorFuel_LiquidFuel',
            updated: FactoryPowerChangeType.Building,
          })
          powerProducer = mockFactory.powerProducers[0]
          group = powerProducer.buildingGroups[0]
          calculateFactories([mockFactory], gameData)
        })

        it('should correctly scale ingredients based on an overclock', () => {
          group.overclockPercent = 127.5555

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.LiquidFuel).toBe(25.511) // 25.51 in game

          group.overclockPercent = 222.2222

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.LiquidFuel).toBe(44.444) // 44.44 in game
        })

        it('should correctly scale ingredients based on an underclock', () => {
          group.overclockPercent = 55.223

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.LiquidFuel).toBe(11.045) // 11.04 in game

          group.overclockPercent = 13.37

          calculateBuildingGroupParts([powerProducer], ItemType.Power, mockFactory)

          expect(group.parts.LiquidFuel).toBe(2.674) // 2.67 in game
        })
      })
    })
  })

  describe('updateBuildingGroupViaPart', () => {
    beforeEach(async () => {
      mockFactory = newFactory('Test Update Group')
    })

    describe('product', () => {
      let product: FactoryItem

      beforeEach(() => {
        addProductToFactory(mockFactory, {
          id: 'IronRod',
          amount: 15,
          recipe: 'IronRod',
        })
        product = mockFactory.products[0]
        group = product.buildingGroups[0]
      })

      describe('building counts and overclocks', () => {
        it('should update a product group when building count would result in >1, and underclock the remainder', () => {
        // For "IronRod", assume its recipe (from gameData) defines:
        //   ingredient "IronIngot" with perMin = 15.
        // If we update "IronIngot" to 20, then:
        //   targetEffective = 20 / 15 ≈ 1.33.
        // For n = 1: candidate clock = ceil(1.33 * 100) = 134 (>100%).
        // For n = 2: candidate clock = ceil((1.33/2) * 100) = ceil(66.5) = 67 (≤100%).
        // We expect the function to choose buildings = 2 and clock = 67.
          updateBuildingGroupViaPart(group, product, ItemType.Product, mockFactory, 'IronIngot', 20)
          expect(group.buildingCount).toBe(2)
          expect(group.overclockPercent).toBe(67)
        })

        it('should update a product group with an underclock when targetEffective < 1', () => {
        // For baseRate = 15, if we update the part amount to 10:
        // targetEffective = 10/15 ≈ 0.666666666666667 (0.667 rounded to 3 precision).
        // Because it is sub 1, we expect a building count of the minimum of 1 and with an underclock.
          updateBuildingGroupViaPart(group, product, ItemType.Product, mockFactory, 'IronIngot', 10)
          expect(group.buildingCount).toBe(1)
          expect(group.overclockPercent).toBe(66.667)
        })

        it('should update a product group when the part is a decimal', () => {
        // For baseRate = 15, if we update the part amount to 7.5:
        // targetEffective = 7.5/15 = 0.5.
          updateBuildingGroupViaPart(group, product, ItemType.Product, mockFactory, 'IronIngot', 7.5)
          expect(group.buildingCount).toBe(1)
          expect(group.overclockPercent).toBe(50)
        })

        it('should update a product group when the part is a decimal with high precision', () => {
        // For baseRate = 15, if we update the part amount to 7.5:
        // targetEffective = 7.555/15 = 0.503666666666667.
          updateBuildingGroupViaPart(group, product, ItemType.Product, mockFactory, 'IronIngot', 7.555)
          expect(group.buildingCount).toBe(1)
          expect(group.overclockPercent).toBe(50.367)
        })
      })

      describe('part re-calculations', () => {
        beforeEach(() => {
          mockFactory.products = []
          addProductToFactory(mockFactory, {
            id: 'AlienPowerFuel',
            amount: 2,
            recipe: 'AlienPowerFuel',
          })
          product = mockFactory.products[0]
          group = mockFactory.products[0].buildingGroups[0]
          calculateFactories([mockFactory], gameData) // Needed for item requirements.
        })
        it('should update a product group when the part is an ingredient AND update all parts', () => {
          updateBuildingGroupViaPart(group, product, ItemType.Product, mockFactory, 'SAMFluctuator', 120)

          expect(group.buildingCount).toBe(10)
          expect(group.overclockPercent).toBe(96)
          expect(group.parts.AlienPowerFuel).toBe(24) // Product
          expect(group.parts.DarkEnergy).toBe(576) // Byproduct AND ingredient
          expect(group.parts.SAMFluctuator).toBe(120) // Ingredient
          expect(group.parts.CrystalShard).toBe(72) // Ingredient
          expect(group.parts.QuantumOscillator).toBe(72) // Ingredient
          expect(group.parts.QuantumEnergy).toBe(576) // Ingredient aka Excited Photonic Matter
        })

        it('should update a product group when the part is a byproduct', () => {
          updateBuildingGroupViaPart(group, product, ItemType.Product, mockFactory, 'DarkEnergy', 120)

          expect(group.buildingCount).toBe(2)
          expect(group.overclockPercent).toBe(100)
          expect(group.parts.DarkEnergy).toBe(120)
          expect(group.parts.AlienPowerFuel).toBe(5)
        })
      })
    })

    describe('power', () => {
      let powerProducer: FactoryPowerProducer

      beforeEach(() => {
        addPowerProducerToFactory(mockFactory, {
          building: 'generatorfuel',
          fuelAmount: 80,
          recipe: 'GeneratorFuel_LiquidFuel',
          updated: FactoryPowerChangeType.Building,
        })
        powerProducer = mockFactory.powerProducers[0]
        group = powerProducer.buildingGroups[0]
      })

      it('should update a power group when the part is an ingredient', () => {
      // Assume that for the "GeneratorFuel_LiquidFuel" recipe, the ingredient "LiquidFuel" has perMin = 20.
      // If we update "LiquidFuel" to 10, then targetEffective = 10 / 20 = 0.5.
      // The result should be 1 building with an underclock of 50%.
        updateBuildingGroupViaPart(group, powerProducer, ItemType.Power, mockFactory, 'LiquidFuel', 10)
        expect(group.buildingCount).toBe(1)
        expect(group.overclockPercent).toBeCloseTo(50, 0)
      })

      it('should update a power group when the part is in the byproduct', () => {
        mockFactory.powerProducers = []
        addPowerProducerToFactory(mockFactory, {
          building: 'generatornuclear',
          buildingAmount: 2,
          recipe: 'GeneratorNuclear_NuclearFuelRod',
          updated: FactoryPowerChangeType.Building,
        })
        powerProducer = mockFactory.powerProducers[0]
        group = powerProducer.buildingGroups[0]
        calculateFactories([mockFactory], gameData) // Needed for ingredient data

        updateBuildingGroupViaPart(group, powerProducer, ItemType.Power, mockFactory, 'NuclearWaste', 100)

        expect(group.buildingCount).toBe(10)
        expect(group.overclockPercent).toBe(100)

        expect(group.parts.NuclearFuelRod).toBe(2) // Fuel
        expect(group.parts.Water).toBe(2400) // Ingredient
        expect(group.parts.NuclearWaste).toBe(100) // Byproduct

        // Also check the power
        expect(group.powerProduced).toBe(25000)
      })
    })
  })
})

describe('bestEffortUpdateBuildingCount', () => {
  let mockFactory: Factory
  let buildingGroup: BuildingGroup

  beforeEach(() => {
    mockFactory = newFactory('Best Effort')
  })

  describe('Products', () => {
    let product: FactoryItem
    beforeEach(() => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 60,
        recipe: 'IngotIron',
      })
      product = mockFactory.products[0]
      buildingGroup = product.buildingGroups[0]
    })

    it('should calculate normal ratios', () => {
      product.buildingRequirements.amount = 2
      bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)

      expect(buildingGroup.buildingCount).toBe(2)
      expect(buildingGroup.overclockPercent).toBe(100)
    })

    it('should calculate ratios of 1:1.5', () => {
      product.amount = 45
      bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)

      expect(buildingGroup.buildingCount).toBe(2)
      expect(buildingGroup.overclockPercent).toBe(75)
    })

    it('should allow fractionals of 0.0001', () => {
      product.amount = 40
      bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)

      expect(buildingGroup.buildingCount).toBe(2)
      expect(buildingGroup.overclockPercent).toBe(66.6667)
    })

    it('should allow user to be utterly bonkers with their requirements', () => {
      product.amount = 40.0001
      bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)

      expect(buildingGroup.buildingCount).toBe(2)
      expect(buildingGroup.overclockPercent).toBe(66.6668)
    })

    it('should allow user to enter lower than 100% for one building', () => {
      product.amount = 15
      bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)

      expect(buildingGroup.buildingCount).toBe(1)
      expect(buildingGroup.overclockPercent).toBe(50)
    })

    it('should calculate properly for multiple building groups', () => {
      addProductBuildingGroup(product, mockFactory)
      const buildingGroup2 = product.buildingGroups[1]

      buildingGroup.buildingCount = 1
      buildingGroup2.buildingCount = 1
      product.amount = 306

      bestEffortUpdateBuildingCount(product, buildingGroup, [buildingGroup, buildingGroup2], ItemType.Product)

      // Should result in 12 buildings, because we have multiple groups, each group would result in a flat .2 extra buildings
      // So we need to add 1 to each group (to make it 6 rather than 5), and underclock ALL groups to make it even.
      // 306/30 = 10.2, 12 buildings = 85%
      expect(buildingGroup.buildingCount).toBe(6)
      expect(buildingGroup.overclockPercent).toBe(85)
      expect(buildingGroup2.buildingCount).toBe(6)
      expect(buildingGroup2.overclockPercent).toBe(85)
    })

    it('should calculate properly for multiple building groups, bonkers style :D', () => {
    // Make 19 groups
      for (let i = 0; i < 19; i++) {
        addProductBuildingGroup(product, mockFactory)
      }

      product.amount = 600

      bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)

      expect(buildingGroup.buildingCount).toBe(1)
      expect(buildingGroup.overclockPercent).toBe(100)
      expect(product.buildingGroups[9].buildingCount).toBe(1)
      expect(product.buildingGroups[9].overclockPercent).toBe(100)

      product.amount = 666
      bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)

      // Calculations:
      // 666 / 20 = 33.3 per building group
      // 33.3 / 30 = 1.1 buildings, so 2 buildings
      // 1.11 * 100 = 111% OC
      // 111 / 2 = 55.5% UC
      expect(buildingGroup.buildingCount).toBe(2)
      expect(buildingGroup.overclockPercent).toBe(55.5)
      expect(product.buildingGroups[9].buildingCount).toBe(2)
      expect(product.buildingGroups[9].overclockPercent).toBe(55.5)
    })

    it('should handle really low inputs', () => {
      product.amount = 0.3

      bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)

      expect(buildingGroup.buildingCount).toBe(1)
      expect(buildingGroup.overclockPercent).toBe(1)
    })

    it('should handle invalid inputs', () => {
      product.amount = -1

      // An exception should be thrown
      expect(() => {
        bestEffortUpdateBuildingCount(product, buildingGroup, product.buildingGroups, ItemType.Product)
      }).toThrow('productBuildingGroups: bestEffortUpdateBuildingCount: Item amount is 0!')
    })
  })

  describe('powerProducer', () => {
    let powerProducer: any

    beforeEach(() => {
      addPowerProducerToFactory(mockFactory, {
        building: 'generatornuclear',
        fuelAmount: 1,
        recipe: 'GeneratorNuclear_NuclearFuelRod',
        updated: FactoryPowerChangeType.Building,
      })
      powerProducer = mockFactory.powerProducers[0]
      buildingGroup = powerProducer.buildingGroups[0]
    })

    it('should calculate based off one building group with nice ratios', () => {
      bestEffortUpdateBuildingCount(powerProducer, buildingGroup, powerProducer.buildingGroups, ItemType.Power)

      expect(buildingGroup.buildingCount).toBe(5)
      expect(buildingGroup.overclockPercent).toBe(100)
    })

    it('should calculate based off one building group with spicy ratios', () => {
      powerProducer.fuelAmount = 1.25
      bestEffortUpdateBuildingCount(powerProducer, buildingGroup, powerProducer.buildingGroups, ItemType.Power)

      expect(buildingGroup.buildingCount).toBe(7)
      expect(buildingGroup.overclockPercent).toBe(89.2857)

      // Calculation
      // 1.25 / 1 = 1.25 per building group
      // 1.25 / 0.2 = 6.25 effective buildings -> 7 buildings
      // (6.25 * 100) / 7 = 89.28571429 UC
    })

    it('should calculate based off one building group with spicy-a-meateball ratios', () => {
      powerProducer.fuelAmount = 1.3333
      bestEffortUpdateBuildingCount(powerProducer, buildingGroup, powerProducer.buildingGroups, ItemType.Power)

      expect(buildingGroup.buildingCount).toBe(7)
      expect(buildingGroup.overclockPercent).toBe(95.2357)

      // Calculation
      // 1.3333 / 1 = 1.3333 per building group
      // 1.3333 / 0.2 = 6.6665 effective buildings -> 7 buildings
      // (6.6665 * 100) / 7 = 95.23571429 UC
    })

    it('should calculate based off multiple building groups', () => {
      addPowerProducerBuildingGroup(powerProducer, mockFactory)
      const buildingGroup2 = powerProducer.buildingGroups[1]

      powerProducer.fuelAmount = 1.3333
      bestEffortUpdateBuildingCount(powerProducer, buildingGroup, powerProducer.buildingGroups, ItemType.Power)

      expect(buildingGroup.buildingCount).toBe(4)
      expect(buildingGroup.overclockPercent).toBe(83.3312)

      expect(buildingGroup2.buildingCount).toBe(4)
      expect(buildingGroup2.overclockPercent).toBe(83.3312)

      // Calculation
      // 1.3333 / 2 = 0.66665 per building group
      // 0.66665 / 0.2 = 3.33325 effective buildings -> 4 buildings
      // (3.33325 * 100) / 4 = 83.33125 UC
    })

    it('should calculate based off a bonkers amount of building groups', () => {
      // Make 19 more groups
      for (let i = 0; i < 19; i++) {
        addPowerProducerBuildingGroup(powerProducer, mockFactory)
      }

      powerProducer.fuelAmount = 20.5
      bestEffortUpdateBuildingCount(powerProducer, buildingGroup, powerProducer.buildingGroups, ItemType.Power)

      expect(buildingGroup.buildingCount).toBe(6)
      expect(buildingGroup.overclockPercent).toBe(85.4167)

      expect(powerProducer.buildingGroups[9].buildingCount).toBe(6)
      expect(powerProducer.buildingGroups[9].overclockPercent).toBe(85.4167)

      // Calculation
      // 20.5 / 20 = 1.025 per building group
      // 1.025 / 0.2 = 5.125 effective buildings -> 6 buildings
      // (5.125 * 100) / 6 = 85.41666667 UC
    })
  })
})
