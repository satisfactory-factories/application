import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryDependencyMetrics } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { createSimple } from '@/utils/factory-setups/simple-plan'

let factories: Factory[]
let factory: Factory

describe('Simple factory plan', () => {
  beforeEach(() => {
    const templateInstance = createSimple()
    factories = templateInstance.getFactories()
    factory = findFacByName('Iron Ingots', factories)
    calculateFactories(factories, gameData)
  })
  it('should have a name', () => {
    expect(factory.name).toBe('Iron Ingots')
  })
  it('should have a product', () => {
    expect(factory.products.length).toBe(1)
    expect(factory.products[0].id).toBe('IronIngot')
    expect(factory.products[0].amount).toBe(100)
    expect(factory.products[0].recipe).toBe('IngotIron')
  })
  it('should have correctly calculated product requirements', () => {
    expect(factory.products[0].requirements).toStrictEqual({ OreIron: { amount: 100 } })
  })
  it('should have no byproducts', () => {
    expect(factory.products[0].byProducts).toHaveLength(0)
  })
  it('should have no internal products', () => {
    expect(factory.internalProducts).toStrictEqual({})
  })
  it('should have no inputs', () => {
    expect(factory.inputs).toHaveLength(0)
  })
  it('should have the correct part entries', () => {
    expect(factory.parts.IronIngot).toStrictEqual({
      amountRequired: 0,
      amountSupplied: 100,
      amountSuppliedViaInput: 0,
      amountSuppliedViaProduction: 100,
      amountRemaining: -100,
      satisfied: true,
      isRaw: false,
    })
    expect(factory.parts.OreIron).toStrictEqual({
      amountRequired: 100,
      amountSupplied: 100,
      amountSuppliedViaInput: 100,
      amountSuppliedViaProduction: 0,
      amountRemaining: 0,
      satisfied: true,
      isRaw: true,
    })
  })
  it('should have correctly calculated building requirements', () => {
    expect(factory.buildingRequirements).toStrictEqual({
      smeltermk1: {
        name: 'smeltermk1',
        amount: 3.3333333333333335, // I hate this so much
        powerPerBuilding: 4,
        totalPower: 12.936138367958613,
      },
    })
  })
  it('should have the correct flags', () => {
    expect(factory.requirementsSatisfied).toBe(true)
    expect(factory.hasProblem).toBe(false)
    expect(factory.usingRawResourcesOnly).toBe(true)
  })
  it('should have the correct total power', () => {
    expect(factory.totalPower).toBe(12.936138367958613)
  })
  it('should have a single dependency', () => {
    const ironPlateFac = findFacByName('Iron Plates', factories)
    expect(factory.dependencies.requests).toStrictEqual({
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
      request: 100,
      supply: 100,
      difference: 0,
      isRequestSatisfied: true,
    }
    expect(factory.dependencies.metrics).toStrictEqual({ IronIngot: metrics })
  })
  it('should have the correct raw resources info', () => {
    expect(factory.rawResources).toStrictEqual({
      OreIron: {
        id: 'OreIron',
        name: 'Iron Ore',
        amount: 100,
      },
    })
  })
  it('should have the correct exports info', () => {
    expect(factory.exports).toStrictEqual({
      IronIngot: {
        productId: 'IronIngot',
        surplus: 100,
        demands: 100,
        difference: 0,
        displayOrder: 0,
      },
    })
  })
})
