import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { getRequestsForFactoryByPart } from '@/utils/factory-management/exports'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'

let factories: Factory[]
let oilFac: Factory
let copperIngotsFac: Factory
let copperBasicsFac: Factory
let circuitBoardsFac: Factory
let computersFac: Factory
let uraniumFac: Factory
let plutoniumFac: Factory

// This test file in effect tests most of the functionality we expect from the data.
describe('Complex Demo Plan', () => {
  beforeEach(() => {
    factories = complexDemoPlan().getFactories()
    calculateFactories(factories, gameData, true)
    oilFac = findFacByName('Oil Processing', factories)
    copperIngotsFac = findFacByName('Copper Ingots', factories)
    copperBasicsFac = findFacByName('Copper Basics', factories)
    circuitBoardsFac = findFacByName('Circuit Boards', factories)
    computersFac = findFacByName('Computers (end product)', factories)
    uraniumFac = findFacByName('☢️ Uranium Power', factories)
    plutoniumFac = findFacByName('☢️ Plutonium Processing', factories)
  })

  it('should have factories', () => {
    expect(factories.length).toBeGreaterThan(0)
  })
  it('should have the expected number of factories', () => {
    expect(factories.length).toBe(7)
  })
  describe('Oil Processing', () => {
    it('should have Oil Processing factory configured correctly', () => {
      expect(oilFac.products.length).toBe(2)
      expect(oilFac.products[0].id).toBe('Plastic')
      expect(oilFac.products[0].amount).toBe(640)
      expect(oilFac.products[1].id).toBe('LiquidFuel')
      expect(oilFac.products[1].amount).toBe(40)
      expect(oilFac.powerProducers[0]).toEqual({
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
      expect(oilFac.parts.LiquidOil).toEqual({
        amountRequired: 960,
        amountRequiredExports: 0,
        amountRequiredProduction: 960,
        amountRequiredPower: 0,
        amountSupplied: 960,
        amountSuppliedViaInput: 0,
        amountSuppliedViaRaw: 960,
        amountSuppliedViaProduction: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: true,
        exportable: false,
      })
      expect(oilFac.parts.LiquidFuel).toEqual({
        amountRequired: 40,
        amountRequiredExports: 0,
        amountRequiredProduction: 0,
        amountRequiredPower: 40,
        amountSupplied: 40,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 40,
        amountSuppliedViaRaw: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
      expect(oilFac.parts.HeavyOilResidue).toEqual({
        amountRequired: 60,
        amountRequiredExports: 0,
        amountRequiredProduction: 60,
        amountRequiredPower: 0,
        amountSupplied: 320,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 320,
        amountSuppliedViaRaw: 0,
        amountRemaining: 260,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
    })
    it('should have solid parts calculated correctly', () => {
      expect(oilFac.parts.Plastic).toEqual({
        amountRequired: 640,
        amountRequiredExports: 640,
        amountRequiredProduction: 0,
        amountRequiredPower: 0,
        amountSupplied: 640,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 640,
        amountSuppliedViaRaw: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: false,
        exportable: true,
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
      const requests = getRequestsForFactoryByPart(oilFac, 'Plastic')
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

  describe('Copper Ingots', () => {
    it('should have Copper Ingots factory configured correctly', () => {
      expect(copperIngotsFac.products.length).toBe(1)
      expect(copperIngotsFac.products[0].id).toBe('CopperIngot')
      expect(copperIngotsFac.products[0].amount).toBe(320)

      // Inputs
      expect(copperIngotsFac.inputs).toHaveLength(0) // Raw resources inputs
      expect(copperIngotsFac.rawResources.OreCopper).toStrictEqual({
        id: 'OreCopper',
        name: 'Copper Ore',
        amount: 320,
      })

      // Dependencies
      expect(copperIngotsFac.dependencies.metrics.CopperIngot).toStrictEqual({
        part: 'CopperIngot',
        supply: 320,
        request: 320,
        difference: 0,
        isRequestSatisfied: true,
      })
    })
  })

  describe('Copper Basics', () => {
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
  })

  describe('Circuit Boards', () => {
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
  })

  describe('Computers', () => {
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

  describe('Uranium Power', () => {
    it('should have Uranium Power factory configured correctly', () => {
      expect(uraniumFac.products.length).toBe(5)
      expect(uraniumFac.products[0].id).toBe('Cement')
      expect(uraniumFac.products[0].amount).toBe(60)
      expect(uraniumFac.products[1].id).toBe('SulfuricAcid')
      expect(uraniumFac.products[1].amount).toBe(160)
      expect(uraniumFac.products[2].id).toBe('ElectromagneticControlRod')
      expect(uraniumFac.products[2].amount).toBe(10)
      expect(uraniumFac.products[3].id).toBe('NuclearFuelRod')
      expect(uraniumFac.products[3].amount).toBe(2)
      expect(uraniumFac.products[4].id).toBe('UraniumCell')
      expect(uraniumFac.products[4].amount).toBe(100)

      expect(uraniumFac.powerProducers.length).toBe(1)
      expect(uraniumFac.powerProducers[0]).toEqual({
        building: 'generatornuclear',
        buildingCount: 10,
        buildingAmount: 10,
        powerProduced: 25000,
        powerAmount: 25000,
        ingredientAmount: 2,
        recipe: 'GeneratorNuclear_NuclearFuelRod',
        displayOrder: 0,
        byproduct: {
          part: 'NuclearWaste',
          amount: 100,
        },
        updated: 'power',
        ingredients: [{
          part: 'NuclearFuelRod',
          perMin: 2,
          mwPerItem: 12500,
        }, {
          part: 'Water',
          perMin: 2400,
          supplementalRatio: 0.096,
        }],
      })
    })

    it('should have part data calculated correctly', () => {
      expect(Object.keys(uraniumFac.parts)).toHaveLength(13)
      expect(uraniumFac.parts.Cement).toEqual({
        amountRequired: 60,
        amountRequiredExports: 0,
        amountRequiredProduction: 60,
        amountRequiredPower: 0,
        amountSupplied: 60,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 60,
        amountSuppliedViaRaw: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
      expect(uraniumFac.parts.Stone).toEqual({
        amountRequired: 180,
        amountRequiredExports: 0,
        amountRequiredProduction: 180,
        amountRequiredPower: 0,
        amountSupplied: 180,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 180,
        amountRemaining: 0,
        satisfied: true,
        isRaw: true,
        exportable: false,
      })
      expect(uraniumFac.parts.SulfuricAcid).toEqual({
        amountRequired: 160,
        amountRequiredExports: 0,
        amountRequiredProduction: 160,
        amountRequiredPower: 0,
        amountSupplied: 200,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 200,
        amountSuppliedViaRaw: 0,
        amountRemaining: 40,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
      expect(uraniumFac.parts.Sulfur).toEqual({
        amountRequired: 160,
        amountRequiredExports: 0,
        amountRequiredProduction: 160,
        amountRequiredPower: 0,
        amountSupplied: 160,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 160,
        amountRemaining: 0,
        satisfied: true,
        isRaw: true,
        exportable: false,
      })
      expect(uraniumFac.parts.Water).toEqual({
        amountRequired: 2560,
        amountRequiredExports: 0,
        amountRequiredProduction: 160,
        amountRequiredPower: 2400,
        amountSupplied: 2560,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 2560,
        amountRemaining: 0,
        satisfied: true,
        isRaw: true,
        exportable: false,
      })
      expect(uraniumFac.parts.ElectromagneticControlRod).toEqual({
        amountRequired: 10,
        amountRequiredExports: 0,
        amountRequiredProduction: 10,
        amountRequiredPower: 0,
        amountSupplied: 10,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 10,
        amountSuppliedViaRaw: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
      expect(uraniumFac.parts.Stator).toEqual({
        amountRequired: 15,
        amountRequiredExports: 0,
        amountRequiredProduction: 15,
        amountRequiredPower: 0,
        amountSupplied: 0,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 0,
        amountRemaining: -15,
        satisfied: false,
        isRaw: false,
        exportable: false,
      })
      expect(uraniumFac.parts.CircuitBoardHighSpeed).toEqual({
        amountRequired: 10,
        amountRequiredExports: 0,
        amountRequiredProduction: 10,
        amountRequiredPower: 0,
        amountSupplied: 0,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 0,
        amountRemaining: -10,
        satisfied: false,
        isRaw: false,
        exportable: false,
      })
      expect(uraniumFac.parts.NuclearFuelRod).toEqual({
        amountRequired: 2,
        amountRequiredExports: 0,
        amountRequiredProduction: 0,
        amountRequiredPower: 2,
        amountSupplied: 2,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 2,
        amountSuppliedViaRaw: 0,
        amountRemaining: 0,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
      expect(uraniumFac.parts.UraniumCell).toEqual({
        amountRequired: 100,
        amountRequiredExports: 0,
        amountRequiredProduction: 100,
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
      expect(uraniumFac.parts.SteelPlateReinforced).toEqual({
        amountRequired: 6,
        amountRequiredExports: 0,
        amountRequiredProduction: 6,
        amountRequiredPower: 0,
        amountSupplied: 0,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 0,
        amountRemaining: -6,
        satisfied: false,
        isRaw: false,
        exportable: false,
      })
      expect(uraniumFac.parts.OreUranium).toEqual({
        amountRequired: 200,
        amountRequiredExports: 0,
        amountRequiredProduction: 200,
        amountRequiredPower: 0,
        amountSupplied: 200,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 200,
        amountRemaining: 0,
        satisfied: true,
        isRaw: true,
        exportable: false,
      })
      expect(uraniumFac.parts.NuclearWaste).toEqual({
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
    })

    it('should have dependency metrics calculated correctly', () => {
      expect(uraniumFac.dependencies.metrics.NuclearWaste).toEqual({
        part: 'NuclearWaste',
        request: 100,
        supply: 100,
        difference: 0,
        isRequestSatisfied: true,
      })
    })
  })

  describe('Plutonium Processing', () => {
    it('should have Plutonium Processing factory configured correctly', () => {
      expect(plutoniumFac.products.length).toBe(1)
      expect(plutoniumFac.products[0].id).toBe('NonFissibleUranium')
      expect(plutoniumFac.products[0].amount).toBe(33.333)
      expect(plutoniumFac.inputs.length).toBe(1)
      expect(plutoniumFac.inputs[0].outputPart).toBe('NuclearWaste')
      expect(plutoniumFac.inputs[0].amount).toBe(100)
    })

    it('should have correct part metrics', () => {
      expect(plutoniumFac.parts.NonFissibleUranium).toEqual({
        amountRequired: 0,
        amountRequiredExports: 0,
        amountRequiredProduction: 0,
        amountRequiredPower: 0,
        amountSupplied: 33.333,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 33.333,
        amountSuppliedViaRaw: 0,
        amountRemaining: 33.333,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
      expect(plutoniumFac.parts.NuclearWaste).toEqual({
        amountRequired: 25,
        amountRequiredExports: 0,
        amountRequiredProduction: 25,
        amountRequiredPower: 0,
        amountSupplied: 100,
        amountSuppliedViaInput: 100,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 0,
        amountRemaining: 75,
        satisfied: true,
        isRaw: false,
        exportable: false,
      })
      expect(plutoniumFac.parts.Silica).toEqual({
        amountRequired: 16.667,
        amountRequiredExports: 0,
        amountRequiredProduction: 16.667,
        amountRequiredPower: 0,
        amountSupplied: 0,
        amountSuppliedViaInput: 0,
        amountSuppliedViaProduction: 0,
        amountSuppliedViaRaw: 0,
        amountRemaining: -16.667,
        satisfied: false,
        isRaw: false,
        exportable: false,
      })
      expect(plutoniumFac.parts.NitricAcid).toEqual({
        amountRequired: 10,
        amountRequiredExports: 0,
        amountRequiredProduction: 10,
        amountRequiredPower: 0,
        amountSupplied: 0,
        amountSuppliedViaInput: 0,
        amountSuppliedViaRaw: 0,
        amountSuppliedViaProduction: 0,
        amountRemaining: -10,
        satisfied: false,
        isRaw: false,
        exportable: false,
      })
      expect(plutoniumFac.parts.SulfuricAcid).toEqual({
        amountRequired: 10,
        amountRequiredExports: 0,
        amountRequiredProduction: 10,
        amountRequiredPower: 0,
        amountSupplied: 0,
        amountSuppliedViaInput: 0,
        amountSuppliedViaRaw: 0,
        amountSuppliedViaProduction: 0,
        amountRemaining: -10,
        satisfied: false,
        isRaw: false,
        exportable: false,
      })
      expect(plutoniumFac.parts.Water).toEqual({
        amountRequired: 0,
        amountRequiredExports: 0,
        amountRequiredProduction: 0,
        amountRequiredPower: 0,
        amountSupplied: 9.999899999999998, // This really aught to be rounded
        amountSuppliedViaInput: 0,
        amountSuppliedViaRaw: 0,
        amountSuppliedViaProduction: 9.999899999999998,
        amountRemaining: 9.999899999999998,
        satisfied: true,
        isRaw: true,
        exportable: true,
      })
    })
    it('should show trim on nuclear waste input', () => {

    })
    it('should not show trim on non-fissile uranium product', () => {

    })
    it('should still show Import for the Sulfuric Acid from Uranium Power', () => {

    })
  })
})
