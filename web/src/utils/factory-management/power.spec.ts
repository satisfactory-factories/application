import { beforeAll, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { gameData } from '@/utils/gameData'

let factory: Factory

describe('power', () => {
  beforeAll(() => {
    // Initialize the factory
    factory = newFactory('My fuel plant')
    addProductToFactory(factory, { id: 'LiquidFuel', amount: 480, recipe: 'LiquidFuel' })
    addPowerProducerToFactory(factory, {
      building: 'generatorfuel',
      powerAmount: 480,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: 'power',
    })
    calculateFactories([factory], gameData)
  })

  describe('calculatePowerProducers', () => {
    it('should calculate the correct generator details', () => {
      expect(factory.powerProducers[0].building).toBe('generatorfuel')
      expect(factory.powerProducers[0].buildingAmount).toBe(1.92)
      expect(factory.powerProducers[0].buildingCount).toBe(1.92)
      expect(factory.powerProducers[0].ingredientAmount).toBe(38.4)
      expect(factory.powerProducers[0].byproduct).toBe(null)
      expect(factory.powerProducers[0].powerAmount).toBe(480)
      expect(factory.powerProducers[0].powerProduced).toBe(480)
      expect(factory.powerProducers[0].recipe).toBe('GeneratorFuel_LiquidFuel')
      expect(factory.powerProducers[0].displayOrder).toBe(0)
      expect(factory.powerProducers[0].updated).toBe('power')
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
      beforeAll(() => {
        factory = newFactory('My nuclear plant')
        // Add one nuclear power plant
        addPowerProducerToFactory(factory, {
          building: 'generatornuclear',
          powerAmount: 2500,
          recipe: 'GeneratorNuclear_NuclearFuelRod',
          updated: 'power',
        })
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
          amountRequiredExports: 0,
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
    })
  })
})
