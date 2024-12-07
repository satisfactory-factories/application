import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { getRequestsForFactoryByProduct } from '@/utils/factory-management/exports'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'

let factories: Factory[]
let oilFac: Factory
let copperIngotsFac: Factory
let copperBasicsFac: Factory
let circuitBoardsFac: Factory
let computersFac: Factory

// This test file in effect tests most of the functionality we expect from the data.
describe('Complex Plan', () => {
  beforeEach(() => {
    factories = complexDemoPlan().getFactories()
    calculateFactories(factories, gameData)
    oilFac = findFacByName('Oil Processing', factories)
    copperIngotsFac = findFacByName('Copper Ingots', factories)
    copperBasicsFac = findFacByName('Copper Basics', factories)
    circuitBoardsFac = findFacByName('Circuit Boards', factories)
    computersFac = findFacByName('Computers (end product)', factories)
  })

  it('should have factories', () => {
    expect(factories.length).toBeGreaterThan(0)
  })
  it('should have the expected number of factories', () => {
    expect(factories.length).toBe(5)
  })
  describe('Oil Processing', () => {
    it('should have Oil Processing factory configured correctly', () => {
      expect(oilFac.products.length).toBe(2)
      expect(oilFac.products[0].id).toBe('Plastic')
      expect(oilFac.products[0].amount).toBe(640)
      expect(oilFac.products[1].id).toBe('LiquidFuel')
      expect(oilFac.products[1].amount).toBe(40)
      expect(oilFac.powerProducers[0]).toStrictEqual({
        building: 'generatorfuel',
        buildingCount: 2,
        buildingAmount: 2,
        powerProduced: 500,
        powerAmount: 500,
        ingredientAmount: 40,
        recipe: 'GeneratorFuel_LiquidFuel',
        byproduct: null,
        displayOrder: 0,
        updated: 'power',
        ingredients: [{
          part: 'LiquidFuel',
          perMin: 40,
          mwPerItem: 12.5,
        }],
      })
    })
    it('should have product requirements calculated correctly', () => {
      expect(oilFac.products[0].requirements).toStrictEqual({ LiquidOil: { amount: 960 } })
    })
    it('should have byproducts calculated correctly', () => {
      expect(oilFac.products[0].byProducts).toStrictEqual([{
        id: 'HeavyOilResidue',
        byProductOf: 'Plastic',
        amount: 320,
      }])
    })
    it('should have raw fluids correctly added as raw inputs', () => {
      expect(oilFac.inputs).toHaveLength(0)
      expect(oilFac.rawResources.LiquidOil).toStrictEqual({
        id: 'LiquidOil',
        name: 'Crude Oil',
        amount: 960,
      })
    })
    it('should have fluid parts calculated correctly', () => {
      expect(oilFac.parts.LiquidOil).toStrictEqual({
        amountRequired: 960,
        amountRequiredExports: 0,
        amountRequiredProduction: 960,
        amountRequiredPower: 0,
        amountSupplied: 960,
        amountSuppliedViaInput: 960,
        amountSuppliedViaProduction: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: true,
      })
      expect(oilFac.parts.LiquidFuel).toStrictEqual({
        amountRequired: 40,
        amountRequiredExports: 0,
        amountRequiredProduction: 0,
        amountRequiredPower: 40,
        amountSupplied: 40,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 40,
        amountRemaining: 0,
        satisfied: true,
        isRaw: false,
      })
      expect(oilFac.parts.HeavyOilResidue).toStrictEqual({
        amountRequired: 60,
        amountRequiredExports: 0,
        amountRequiredProduction: 60,
        amountRequiredPower: 0,
        amountSupplied: 320,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 320,
        amountRemaining: 260,
        satisfied: true,
        isRaw: false,
      })
    })
    it('should have solid parts calculated correctly', () => {
      expect(oilFac.parts.Plastic).toStrictEqual({
        amountRequired: 640,
        amountRequiredExports: 640,
        amountRequiredProduction: 0,
        amountRequiredPower: 0,
        amountSupplied: 640,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 640,
        amountRemaining: 0,
        satisfied: true,
        isRaw: false,
      })
    })
    it('should have satisfaction calculated correctly', () => {
      expect(oilFac.requirementsSatisfied).toBe(true)
      expect(oilFac.usingRawResourcesOnly).toBe(false)
      expect(oilFac.hasProblem).toBe(false)
    })
    it('should have dependencies calculated correctly', () => {
      expect(Object.keys(oilFac.dependencies.requests)).toHaveLength(2)
      expect(oilFac.dependencies.metrics.Plastic.request).toBe(640) // Comes from 2 requests
    })
    it('should have the correct dependencies and metrics', () => {
      const requests = getRequestsForFactoryByProduct(oilFac, 'Plastic')
      const expectedFactoryIds = [computersFac.id, circuitBoardsFac.id]
      let found = 0
      let productAmount = 0

      requests.forEach(request => {
        if (expectedFactoryIds.includes(request.requestingFactoryId)) {
          found++
          productAmount += request.amount
        }
      })

      if (found !== expectedFactoryIds.length) {
        throw new Error('Not all expected factories were found in the requests')
      }

      if (productAmount !== oilFac.dependencies.metrics.Plastic.request) {
        throw new Error('The total product amount found via dependencies  does not match the expected requested amount')
      }
    })

    it('should have the correct amount of power calculated', () => {
      // Should be 33 buildings * 30 power per building = 990
      expect(oilFac.power.consumed).toBe(990)
    })

    it('should have the correct number of buildings calculated along with their power', () => {
      expect(oilFac.buildingRequirements).toStrictEqual({
        generatorfuel: {
          amount: 2,
          name: 'generatorfuel',
          powerProduced: 500,
        },
        oilrefinery: {
          amount: 33,
          name: 'oilrefinery',
          powerConsumed: 990,
        },
      })
    })
  })

  it('should have Copper Ingots factory configured correctly', () => {
    expect(copperIngotsFac.products.length).toBe(1)
    expect(copperIngotsFac.products[0].id).toBe('CopperIngot')
    expect(copperIngotsFac.products[0].amount).toBe(640)

    // Inputs
    expect(copperIngotsFac.inputs).toHaveLength(0) // Raw resources inputs
    expect(copperIngotsFac.rawResources.OreCopper).toStrictEqual({
      id: 'OreCopper',
      name: 'Copper Ore',
      amount: 640,
    })

    // Dependencies
    expect(copperIngotsFac.dependencies.metrics.CopperIngot).toStrictEqual({
      part: 'CopperIngot',
      supply: 640,
      request: 320,
      difference: 320,
      isRequestSatisfied: true,
    })
  })
  it('should have Copper Basics factory configured correctly', () => {
    expect(copperBasicsFac.products.length).toBe(3)
    expect(copperBasicsFac.products[0].id).toBe('Wire')
    expect(copperBasicsFac.products[0].amount).toBe(400)
    expect(copperBasicsFac.products[1].id).toBe('Cable')
    expect(copperBasicsFac.products[1].amount).toBe(200)
    expect(copperBasicsFac.products[2].id).toBe('CopperSheet')
    expect(copperBasicsFac.products[2].amount).toBe(160)

    // Inputs
    expect(copperBasicsFac.inputs.length).toBe(1)
    expect(copperBasicsFac.inputs[0].factoryId).toBe(copperIngotsFac.id)
    expect(copperBasicsFac.inputs[0].outputPart).toBe('CopperIngot')
    expect(copperBasicsFac.inputs[0].amount).toBe(320) // Deliberate shortage

    // Dependencies
    expect(copperBasicsFac.dependencies.metrics.Cable).toStrictEqual({
      part: 'Cable',
      request: 160,
      supply: 200,
      difference: 40,
      isRequestSatisfied: true,
    })
  })
  it('should have Circuit Boards factory configured correctly', () => {
    expect(circuitBoardsFac.products.length).toBe(1)
    expect(circuitBoardsFac.products[0].id).toBe('CircuitBoard')
    expect(circuitBoardsFac.products[0].amount).toBe(80)

    expect(circuitBoardsFac.inputs.length).toBe(2)
    expect(circuitBoardsFac.inputs[0].outputPart).toBe('CopperSheet')
    expect(circuitBoardsFac.inputs[0].amount).toBe(160)
    expect(circuitBoardsFac.inputs[1].outputPart).toBe('Plastic')
    expect(circuitBoardsFac.inputs[1].amount).toBe(320)

    // Dependencies
    expect(circuitBoardsFac.dependencies.metrics.CircuitBoard).toStrictEqual({
      part: 'CircuitBoard',
      request: 80,
      supply: 80,
      difference: 0,
      isRequestSatisfied: true,
    })
  })
  it('should have Computers factory configured correctly', () => {
    expect(computersFac.products.length).toBe(1)
    expect(computersFac.products[0].id).toBe('Computer')
    expect(computersFac.products[0].amount).toBe(20)

    expect(computersFac.inputs.length).toBe(3)
    expect(computersFac.inputs[0].outputPart).toBe('Plastic')
    expect(computersFac.inputs[0].amount).toBe(320)
    expect(computersFac.inputs[1].outputPart).toBe('Cable')
    expect(computersFac.inputs[1].amount).toBe(160)
    expect(computersFac.inputs[2].outputPart).toBe('CircuitBoard')
    expect(computersFac.inputs[2].amount).toBe(80)

    // Dependencies
    expect(computersFac.dependencies.metrics).toStrictEqual({}) // No dependants
  })
})
