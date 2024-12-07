import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addPowerProducerToFactory, addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { calculatePowerProducers } from '@/utils/factory-management/power'

let factory: Factory

describe('power', () => {
  beforeEach(() => {
    // Initialize the factory
    factory = newFactory('My fuel plant')
    addProductToFactory(factory, { id: 'ParserFuel', amount: 480, recipe: 'ParserFuel' })
    addPowerProducerToFactory(factory, {
      building: 'FuelGenerator',
      powerAmount: 480,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: 'power',
    })
  })

  describe('calculatePowerIngredients', () => {
    it('should calculate the amount of ingredients needed to produce the power for a producer', () => {
      calculatePowerProducers(factory, gameData)

      expect(factory.powerProducers[0].ingredients[0]).toStrictEqual({
        mwPerItem: 12.5,
        part: 'LiquidFuel',
        perMin: 38.4,
      })
    })
  })
})
