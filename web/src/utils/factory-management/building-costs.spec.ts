import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addCustomBuildingToFactory } from '@/utils/factory-management/custom-buildings'
import { calculateBuildingMaterialCosts, getBuildingCost } from '@/utils/factory-management/building-costs'
import { gameData } from '@/utils/gameData'

describe('building costs', () => {
  let factory: Factory

  beforeEach(() => {
    factory = newFactory('Test Factory')
  })

  describe('getBuildingCost', () => {
    it('should return the game data cost for a known building', () => {
      expect(getBuildingCost('constructormk1', gameData)).toEqual([
        { part: 'IronPlateReinforced', amount: 2 },
        { part: 'Cable', amount: 8 },
      ])
    })

    it('should return an empty list for a building with no cost data', () => {
      expect(getBuildingCost('nonexistentbuilding', gameData)).toEqual([])
    })
  })

  describe('calculateBuildingMaterialCosts', () => {
    it('should total the cost of a production building by its final count', () => {
      // Iron Plate: 20/min per Constructor, so 40/min needs exactly 2.
      addProductToFactory(factory, { id: 'IronPlate', amount: 40, recipe: 'IronPlate' })
      calculateFactories([factory], gameData)

      expect(factory.buildingMaterialCosts.IronPlateReinforced).toEqual({
        amount: 4,
        buildings: { constructormk1: 2 },
      })
      expect(factory.buildingMaterialCosts.Cable).toEqual({
        amount: 16,
        buildings: { constructormk1: 2 },
      })
    })

    it('should total the cost of a power generator', () => {
      addPowerProducerToFactory(factory, {
        building: 'generatorcoal',
        buildingAmount: 3,
        recipe: 'GeneratorCoal_Coal',
        updated: FactoryPowerChangeType.Building,
      })
      calculateFactories([factory], gameData)

      expect(factory.buildingMaterialCosts.Rotor).toEqual({
        amount: 30,
        buildings: { generatorcoal: 3 },
      })
    })

    it('should total the cost of a custom building', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      calculateFactories([factory], gameData)

      expect(factory.buildingMaterialCosts.FicsiteMesh).toEqual({
        amount: 500,
        buildings: { portal: 10 },
      })
      expect(factory.buildingMaterialCosts.MotorLightweight).toEqual({
        amount: 50,
        buildings: { portal: 10 },
      })
    })

    it('should merge a part shared by more than one kind of building', () => {
      // Both the Constructor and the Coal Generator cost Cable.
      addProductToFactory(factory, { id: 'IronPlate', amount: 20, recipe: 'IronPlate' })
      addPowerProducerToFactory(factory, {
        building: 'generatorcoal',
        buildingAmount: 1,
        recipe: 'GeneratorCoal_Coal',
        updated: FactoryPowerChangeType.Building,
      })
      calculateFactories([factory], gameData)

      expect(factory.buildingMaterialCosts.Cable).toEqual({
        amount: 38, // 8 (1 Constructor) + 30 (1 Coal Generator)
        buildings: { constructormk1: 1, generatorcoal: 1 },
      })
    })

    it('should give an empty factory no material costs', () => {
      calculateFactories([factory], gameData)

      expect(factory.buildingMaterialCosts).toEqual({})
    })

    it('should not list a building the user has not chosen anything for yet', () => {
      addCustomBuildingToFactory(factory)
      calculateFactories([factory], gameData)

      expect(factory.buildingMaterialCosts).toEqual({})
    })

    it('should ignore a building with no cost data rather than throw', () => {
      factory.buildingRequirements = {
        madeupbuilding: { name: 'madeupbuilding', amount: 5, powerConsumed: 0 },
      }

      expect(() => calculateBuildingMaterialCosts(factory, gameData)).not.toThrow()
      expect(factory.buildingMaterialCosts).toEqual({})
    })
  })
})
