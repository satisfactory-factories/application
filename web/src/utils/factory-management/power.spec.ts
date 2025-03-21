import { beforeEach, describe, expect, it } from 'vitest'
import {
  BuildingGroup,
  Factory,
  FactoryPowerChangeType,
  FactoryPowerProducer,
} from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { gameData } from '@/utils/gameData'

describe('power', () => {
  let factory: Factory

  beforeEach(() => {
    // Initialize the factory
    factory = newFactory('My fuel plant')
    addProductToFactory(factory, { id: 'LiquidFuel', amount: 480, recipe: 'LiquidFuel' })
    addPowerProducerToFactory(factory, {
      building: 'generatorfuel',
      powerAmount: 480,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Power,
    })
    calculateFactories([factory], gameData)
  })

  describe('addPowerProducerToFactory', () => {
    // Reset it
    beforeEach(() => {
      factory = newFactory('My fuel plant clean')
    })
    it('should add a power producer to the factory via buildings', () => {
      addPowerProducerToFactory(factory, {
        building: 'generatorfuel',
        buildingAmount: 5,
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Building,
      })

      expect(factory.powerProducers[0].buildingCount).toBe(0) // Calculated after
      expect(factory.powerProducers[0].buildingAmount).toBe(5)
    })

    it('should add a power producer to the factory via buildings', () => {
      addPowerProducerToFactory(factory, {
        building: 'generatorfuel',
        powerAmount: 250,
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Power,
      })

      expect(factory.powerProducers[0].buildingCount).toBe(0) // Calculated after
      expect(factory.powerProducers[0].powerProduced).toBe(0) // Calculated after
      expect(factory.powerProducers[0].powerAmount).toBe(250)
    })

    it('should add a building group when added, with the requested buildings', () => {
      addPowerProducerToFactory(factory, {
        building: 'generatorfuel',
        buildingAmount: 5,
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Building,
      })

      const group = factory.powerProducers[0].buildingGroups[0]
      expect(group.buildingCount).toBe(5)
    })

    it('should add a building group when added, with parts', () => {
      addPowerProducerToFactory(factory, {
        building: 'generatorfuel',
        buildingAmount: 5,
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Building,
      })

      const group = factory.powerProducers[0].buildingGroups[0]
      expect(group.parts.LiquidFuel).toBe(100)
    })
  })

  describe('calculatePowerProducers', () => {
    it('should calculate the correct generator details', () => {
      expect(factory.powerProducers[0].building).toBe('generatorfuel')
      expect(factory.powerProducers[0].buildingAmount).toBe(1.92)
      expect(factory.powerProducers[0].buildingCount).toBe(1.92)
      expect(factory.powerProducers[0].fuelAmount).toBe(38.4)
      expect(factory.powerProducers[0].byproduct).toBe(null)
      expect(factory.powerProducers[0].powerAmount).toBe(480)
      expect(factory.powerProducers[0].powerProduced).toBe(480)
      expect(factory.powerProducers[0].recipe).toBe('GeneratorFuel_LiquidFuel')
      expect(factory.powerProducers[0].displayOrder).toBe(0)
      expect(factory.powerProducers[0].updated).toBe(FactoryPowerChangeType.Power)
    })

    it('should calculate the correct amount of ingredients', () => {
      expect(factory.powerProducers[0].ingredients[0]).toEqual({
        part: 'LiquidFuel',
        perMin: 38.4,
        mwPerItem: 12.5,
      })
    })

    it('should add the ingredient parts to the factory.parts array', () => {
      expect(factory.parts.LiquidFuel).toEqual({
        amountRequired: 38.4,
        amountRequiredProduction: 0,
        amountRequiredExports: 0,
        amountRequiredPower: 38.4,
        amountSupplied: 480,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 480,
        amountSuppliedViaRaw: 0,
        amountRemaining: 441.6,
        isRaw: false,
        satisfied: true,
        exportable: true, // Because it's produced in the factory in question
      })
    })

    describe('Nuclear Power', () => {
      let powerProducer: FactoryPowerProducer

      beforeEach(() => {
        factory = newFactory('My nuclear plant')
        // Add one nuclear power plant
        addPowerProducerToFactory(factory, {
          building: 'generatornuclear',
          powerAmount: 2500,
          recipe: 'GeneratorNuclear_NuclearFuelRod',
          updated: FactoryPowerChangeType.Power,
        })
        powerProducer = factory.powerProducers[0]
        calculateFactories([factory], gameData)
      })

      it('should calculate primary and supplemental fuels correctly', () => {
        expect(factory.powerProducers[0].ingredients[0]).toEqual({
          part: 'NuclearFuelRod',
          perMin: 0.2,
          mwPerItem: 12500,
        })
        expect(factory.powerProducers[0].ingredients[1]).toEqual({
          part: 'Water',
          perMin: 240,
          supplementalRatio: 0.096,
        })
      })
      it('should add byproduct to the producer byproduct', () => {
        expect(factory.powerProducers[0].byproduct).toEqual({
          part: 'NuclearWaste',
          amount: 10,
        })
      })

      it('should add the primary fuel to the factory.parts array and be exportable', () => {
        expect(factory.parts.NuclearFuelRod).toEqual({
          amountRequired: 0.2,
          amountRequiredProduction: 0,
          amountRequiredExports: 0,
          amountRequiredPower: 0.2,
          amountSupplied: 0,
          amountSuppliedViaInput: 0,
          amountSuppliedViaProduction: 0,
          amountSuppliedViaRaw: 0,
          amountRemaining: -0.2,
          isRaw: false,
          satisfied: false,
          exportable: false,
        })
      })

      it('should add the byproduct to the factory.parts array and be exportable', () => {
        calculateFactories([factory], gameData)
        expect(factory.parts.NuclearWaste).toEqual({
          amountRequired: 0,
          amountRequiredProduction: 0,
          amountRequiredExports: 0,
          amountRequiredPower: 0,
          amountSupplied: 10,
          amountSuppliedViaInput: 0,
          amountSuppliedViaRaw: 0,
          amountSuppliedViaProduction: 10,
          amountRemaining: 10,
          isRaw: false,
          satisfied: true,
          exportable: true,
        })
      })

      it('should calculate the correct amount of buildings', () => {
        expect(factory.powerProducers[0].buildingAmount).toBe(1)
        expect(factory.powerProducers[0].buildingCount).toBe(1)
      })

      it('should add the supplemental fuel to the factory.parts array and it be raw and not exportable', () => {
        expect(factory.parts.Water).toEqual({
          amountRequired: 240,
          amountRequiredProduction: 0,
          amountTeRequiredExports: 0,
          amountRequiredPower: 240,
          amountSupplied: 240,
          amountSuppliedViaInput: 0,
          amountSuppliedViaRaw: 240,
          amountSuppliedViaProduction: 0,
          amountRemaining: 0,
          isRaw: true,
          satisfied: true,
          exportable: false,
        })
      })

      describe('updating', () => {
        let buildingGroup: BuildingGroup

        beforeEach(() => {
          buildingGroup = powerProducer.buildingGroups[0]
          powerProducer.buildingGroupItemSync = true
        })

        describe('via building', () => {
          it('should update when the building count is updated', () => {
            powerProducer.buildingAmount = 2
            powerProducer.updated = FactoryPowerChangeType.Building

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(2)
            expect(powerProducer.ingredients[0].perMin).toBe(0.4)
            expect(powerProducer.ingredients[1].perMin).toBe(480)
            expect(powerProducer.byproduct?.amount).toBe(20)
            expect(powerProducer.fuelAmount).toBe(0.4)
            expect(powerProducer.powerProduced).toBe(5000)
            expect(buildingGroup.buildingCount).toBe(2)
            expect(buildingGroup.overclockPercent).toBe(100)

            powerProducer.buildingAmount = 2.5
            powerProducer.updated = FactoryPowerChangeType.Building

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(2.5)
            expect(powerProducer.ingredients[0].perMin).toBe(0.5)
            expect(powerProducer.ingredients[1].perMin).toBe(600)
            expect(powerProducer.byproduct?.amount).toBe(25)
            expect(powerProducer.fuelAmount).toBe(0.5)
            expect(powerProducer.powerProduced).toBe(6250)
            expect(buildingGroup.buildingCount).toBe(3)
            expect(buildingGroup.overclockPercent).toBe(83.333)

            powerProducer.buildingAmount = 2.775
            powerProducer.updated = FactoryPowerChangeType.Building

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(2.775)
            expect(powerProducer.ingredients[0].perMin).toBe(0.555)
            expect(powerProducer.ingredients[1].perMin).toBe(666)
            expect(powerProducer.byproduct?.amount).toBe(27.75)
            expect(powerProducer.fuelAmount).toBe(0.555)
            expect(powerProducer.powerProduced).toBe(6937.5)
            expect(buildingGroup.buildingCount).toBe(3)
            expect(buildingGroup.overclockPercent).toBe(92.5)
          })
        })

        describe('via ingredient', () => {
          it('should update when the ingredient amount is updated', () => {
            powerProducer.ingredients[1].perMin = 2400
            powerProducer.updated = FactoryPowerChangeType.Ingredient

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(10)
            expect(powerProducer.ingredients[0].perMin).toBe(2)
            expect(powerProducer.ingredients[1].perMin).toBe(2400)
            expect(powerProducer.byproduct?.amount).toBe(100)
            expect(powerProducer.powerProduced).toBe(25000)
            expect(buildingGroup.buildingCount).toBe(10)
            expect(buildingGroup.overclockPercent).toBe(100)

            powerProducer.ingredients[1].perMin = 3060
            powerProducer.updated = FactoryPowerChangeType.Ingredient // Gets changed back to building at some point in the calculations

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(12.75)
            expect(powerProducer.ingredients[0].perMin).toBe(2.55)
            expect(powerProducer.ingredients[1].perMin).toBe(3060)
            expect(powerProducer.byproduct?.amount).toBe(127.5)
            expect(powerProducer.powerProduced).toBe(31875)
            expect(buildingGroup.buildingCount).toBe(13)
            expect(buildingGroup.overclockPercent).toBe(98.077)
          })
        })

        describe('via fuel', () => {
          it('should update when the fuel amount is updated', () => {
            powerProducer.fuelAmount = 1
            powerProducer.updated = FactoryPowerChangeType.Fuel

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(5)
            expect(powerProducer.ingredients[0].perMin).toBe(1)
            expect(powerProducer.ingredients[1].perMin).toBe(1200)
            expect(powerProducer.byproduct?.amount).toBe(50)
            expect(powerProducer.powerProduced).toBe(12500)
            expect(buildingGroup.buildingCount).toBe(5)
            expect(buildingGroup.overclockPercent).toBe(100)

            powerProducer.fuelAmount = 1.222
            powerProducer.updated = FactoryPowerChangeType.Fuel // Gets changed back to building at some point after calculations

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(6.11)
            expect(powerProducer.ingredients[0].perMin).toBe(1.222)
            expect(powerProducer.ingredients[1].perMin).toBe(1466.4)
            expect(powerProducer.byproduct?.amount).toBe(61.1)
            expect(powerProducer.powerProduced).toBe(15275)
            expect(buildingGroup.buildingCount).toBe(7)
            expect(buildingGroup.overclockPercent).toBe(87.286)
          })
        })

        describe('via power', () => {
          it('should update when the power amount is updated', () => {
            powerProducer.powerAmount = 10000
            powerProducer.updated = FactoryPowerChangeType.Power

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(4)
            expect(powerProducer.ingredients[0].perMin).toBe(0.8)
            expect(powerProducer.ingredients[1].perMin).toBe(960)
            expect(powerProducer.byproduct?.amount).toBe(40)
            expect(powerProducer.powerProduced).toBe(10000)
            expect(buildingGroup.buildingCount).toBe(4)
            expect(buildingGroup.overclockPercent).toBe(100)

            // More precise version
            powerProducer.powerAmount = 12345
            powerProducer.updated = FactoryPowerChangeType.Power // For some reason it gets changed back to building, presumably building group stuff.

            calculateFactories([factory], gameData)

            expect(powerProducer.buildingCount).toBe(4.938)
            expect(powerProducer.ingredients[0].perMin).toBe(0.988)
            expect(powerProducer.ingredients[1].perMin).toBe(1185.12)
            expect(powerProducer.byproduct?.amount).toBe(49.38)
            expect(powerProducer.powerProduced).toBe(12345)
            expect(buildingGroup.buildingCount).toBe(5)
            expect(buildingGroup.overclockPercent).toBe(98.76)
          })
        })
      })
    })

    describe('waste to fuel conversion', () => {
      it('should properly calculate the amount of fuel rods needed to convert waste to fuel', () => {
        // Given we calculate that we to consume 25 waste per minute to produce 0.5 fuel rods per minute

        factory = newFactory('My nuclear plant')
        // Add one nuclear power plant
        addPowerProducerToFactory(factory, {
          building: 'generatornuclear',
          ingredientAmount: 0.5,
          recipe: 'GeneratorNuclear_NuclearFuelRod',
          updated: FactoryPowerChangeType.Ingredient,
        })

        calculateFactories([factory], gameData)

        // I know for a fact that given we want to burn 25 nuclear waste it should be 0.5 rods / min or 6250MW.

        expect(factory.powerProducers[0].powerProduced).toBe(6250)
        expect(factory.powerProducers[0].fuelAmount).toBe(0.5)
        expect(factory.powerProducers[0].byproduct?.amount).toBe(25)
      })
    })
  })
})
