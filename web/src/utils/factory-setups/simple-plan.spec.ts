import { beforeAll, describe, expect, it } from 'vitest'
import { Factory, FactoryDependencyMetrics } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { createSimple } from '@/utils/factory-setups/simple-plan'

let factories: Factory[]
let ingotFac: Factory
let ironPlateFac: Factory

describe('Simple factory plan', () => {
  beforeAll(() => {
    const templateInstance = createSimple()
    factories = templateInstance.getFactories()
    ingotFac = findFacByName('Iron Ingots', factories)
    ironPlateFac = findFacByName('Iron Plates', factories)
    calculateFactories(factories, gameData, true) // Needed to calculate part metrics, dependencies will not work otherwise.
    calculateFactories(factories, gameData)
  })
  describe('Iron Ingots', () => {
    it('should have a name', () => {
      expect(ingotFac.name).toBe('Iron Ingots')
    })
    it('should have a product', () => {
      expect(ingotFac.products.length).toBe(1)
      expect(ingotFac.products[0].id).toBe('IronIngot')
      expect(ingotFac.products[0].amount).toBe(100)
      expect(ingotFac.products[0].recipe).toBe('IngotIron')
    })
    it('should have correctly calculated product requirements', () => {
      expect(ingotFac.products[0].requirements).toStrictEqual({ OreIron: { amount: 100 } })
    })
    it('should have no byproducts', () => {
      expect(ingotFac.products[0].byProducts).toHaveLength(0)
    })
    it('should have no inputs', () => {
      expect(ingotFac.inputs).toHaveLength(0)
    })
    it('should have the correct part entries', () => {
      expect(ingotFac.parts.IronIngot).toEqual({
        amountRequired: 100,
        amountRequiredExports: 100,
        amountRequiredProduction: 0,
        amountRequiredPower: 0,
        amountSupplied: 100,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 100,
        amountSuppliedViaRaw: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
      expect(ingotFac.parts.OreIron).toEqual({
        amountRequired: 100,
        amountRequiredExports: 0,
        amountRequiredProduction: 100,
        amountRequiredPower: 0,
        amountSupplied: 100,
        amountSuppliedViaInput: 0,
        amountSuppliedViaRaw: 100,
        amountSuppliedViaProduction: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: true,
        exportable: false, // It's raw, so it's not exportable
      })
    })
    it('should have correctly calculated building requirements', () => {
      expect(ingotFac.products[0].buildingRequirements).toStrictEqual({
        name: 'smeltermk1',
        amount: 3.3333333333333335, // Not rounded on purpose so the user can see 3.333x knowing they need a smelter at 33.333% clock speed
        powerConsumed: 12.936138367958613, // Gets rounded eventually
      })
      expect(ingotFac.buildingRequirements).toStrictEqual({
        smeltermk1: {
          name: 'smeltermk1',
          amount: 4, // Rounded up to the nearest whole number
          powerConsumed: 12.936,
        },
      })
    })
    it('should have the correct flags', () => {
      expect(ingotFac.requirementsSatisfied).toBe(true)
      expect(ingotFac.hasProblem).toBe(false)
      expect(ingotFac.usingRawResourcesOnly).toBe(true)
    })
    it('should have the correct total power', () => {
      expect(ingotFac.power.consumed).toBe(12.936)
    })
    it('should have a single dependency', () => {
      const ironPlateFac = findFacByName('Iron Plates', factories)
      expect(ingotFac.dependencies.requests).toEqual({
        [`${ironPlateFac.id}`]: [{
          requestingFactoryId: ironPlateFac.id,
          part: 'IronIngot',
          amount: 100,
        }],
      })
    })
    it('should have the correct dependency metrics', () => {
    // const ironPlateFac = findFacByName('Iron Plates', factories)
      const metrics: FactoryDependencyMetrics = {
        part: 'IronIngot',
        request: 100, // While it's meant to be 150 we have a purposeful shortage
        supply: 100,
        difference: 0,
        isRequestSatisfied: true,
      }
      expect(ingotFac.dependencies.metrics).toEqual({ IronIngot: metrics })
    })
    it('should have the correct raw resources info', () => {
      expect(ingotFac.rawResources).toStrictEqual({
        OreIron: {
          id: 'OreIron',
          name: 'Iron Ore',
          amount: 100,
        },
      })
    })
    it('should have the correct display order', () => {
      expect(ingotFac.displayOrder).toBe(0)
    })
  })

  describe('Iron Plates', () => {
    it('should have the correct display order', () => {
      expect(ironPlateFac.displayOrder).toBe(1)
    })
    it('should have the correct part metrics showing imports', () => {
      expect(ironPlateFac.parts.IronPlate).toEqual({
        amountRequired: 0,
        amountRequiredExports: 0,
        amountRequiredProduction: 0,
        amountRequiredPower: 0,
        amountSupplied: 100,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 100,
        amountSuppliedViaRaw: 0,
        amountRemaining: 100,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
      expect(ironPlateFac.parts.IronIngot).toEqual({
        amountRequired: 150,
        amountRequiredExports: 0,
        amountRequiredProduction: 150,
        amountRequiredPower: 0,
        amountSupplied: 100,
        amountSuppliedViaInput: 100,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 0,
        amountRemaining: -50,
        satisfied: false,
        isRaw: false,
        exportable: false,
      })
    })
    it('should be marked as not using only raw resources', () => {
      expect(ironPlateFac.usingRawResourcesOnly).toBe(false)
    })
  })
})
