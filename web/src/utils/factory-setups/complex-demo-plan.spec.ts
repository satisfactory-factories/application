import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { getPartExportRequests } from '@/utils/factory-management/exports'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { getFactoryPowerShards, getFactorySomersloops } from '@/utils/statistics'

let factories: Factory[]
let oilFac: Factory
let copperIngotsFac: Factory
let copperBasicsFac: Factory
let circuitBoardsFac: Factory
let computersFac: Factory
let uraniumFac: Factory
let plutoniumFac: Factory
let alienPowerFac: Factory
let geothermalFac: Factory

// This test file in effect tests most of the functionality we expect from the data.
describe('Complex Demo Plan', () => {
  beforeEach(() => {
    factories = complexDemoPlan().getFactories()
    calculateFactories(factories, gameData)
    oilFac = findFacByName('Oil Processing', factories)
    copperIngotsFac = findFacByName('Copper Ingots', factories)
    copperBasicsFac = findFacByName('Copper Basics', factories)
    circuitBoardsFac = findFacByName('Circuit Boards', factories)
    computersFac = findFacByName('Computers (end product)', factories)
    uraniumFac = findFacByName('☢️ Uranium Power', factories)
    plutoniumFac = findFacByName('☢️ Plutonium Processing', factories)
    alienPowerFac = findFacByName('Alien Power', factories)
    geothermalFac = findFacByName('Geothermal Power', factories)
  })

  it('should have factories', () => {
    expect(factories.length).toBeGreaterThan(0)
  })
  it('should have the expected number of factories', () => {
    expect(factories.length).toBe(9)
  })
  describe('Oil Processing', () => {
    it('should have Oil Processing factory configured correctly', () => {
      expect(oilFac.products.length).toBe(2)
      expect(oilFac.products[0].id).toBe('Plastic')
      expect(oilFac.products[0].amount).toBe(640)
      expect(oilFac.products[1].id).toBe('LiquidFuel')
      expect(oilFac.products[1].amount).toBe(40)
      // toMatchObject: the producer also carries building group state not asserted here
      expect(oilFac.powerProducers[0]).toMatchObject({
        building: 'generatorfuel',
        buildingCount: 2,
        buildingAmount: 2,
        powerProduced: 500,
        powerAmount: 500,
        fuelAmount: 40,
        recipe: 'GeneratorFuel_LiquidFuel',
        byproduct: null,
        displayOrder: 0,
        updated: FactoryPowerChangeType.Power,
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
      const requests = getPartExportRequests(oilFac, 'Plastic')
      const expectedFactoryIds = [computersFac.id, circuitBoardsFac.id]
      let found = 0
      let productAmount = 0

      requests.forEach(request => {
        if (expectedFactoryIds.includes(request.requestingFactoryId)) {
          found++
          productAmount += request.amount
        }
      })

      expect(found).toBe(expectedFactoryIds.length)
      expect(productAmount).toBe(oilFac.dependencies.metrics.Plastic.request)
    })

    it('should have the correct amount of power calculated', () => {
      // 24 refineries @ 100% (720) + 4 @ 200% (2^1.321928 = 2.5x power, 300) + 1 fuel refinery (30)
      expect(oilFac.power.consumed).toBe(1050)
    })

    it('should have the correct number of buildings calculated along with their power', () => {
      expect(oilFac.buildingRequirements).toStrictEqual({
        generatorfuel: {
          amount: 2,
          name: 'generatorfuel',
          powerProduced: 500,
        },
        oilrefinery: {
          // 24 + 4 overclocked for Plastic, plus 1 for Residual Fuel. powerConsumed here is
          // the 100%-clock equivalent; the overclock-aware figure lives on factory.power.
          amount: 29,
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
      // toMatchObject: the producer also carries building group state not asserted here
      expect(uraniumFac.powerProducers[0]).toMatchObject({
        building: 'generatornuclear',
        buildingCount: 10,
        buildingAmount: 10,
        powerProduced: 25000,
        powerAmount: 25000,
        fuelAmount: 2,
        recipe: 'GeneratorNuclear_NuclearFuelRod',
        displayOrder: 0,
        byproduct: {
          part: 'NuclearWaste',
          amount: 100,
        },
        updated: FactoryPowerChangeType.Power,
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
        amountSupplied: 10,
        amountSuppliedViaInput: 0,
        amountSuppliedViaRaw: 0,
        amountSuppliedViaProduction: 10,
        amountRemaining: 10,
        satisfied: true,
        isRaw: true,
        exportable: true,
      })
    })
  })

  describe('Alien Power', () => {
    it('should have three augmenters producing 500 MW each', () => {
      expect(alienPowerFac.powerProducers.length).toBe(1)
      expect(alienPowerFac.powerProducers[0]).toMatchObject({
        building: 'alienpoweraugmenter',
        buildingCount: 3,
        buildingAmount: 3,
        powerProduced: 1500,
        recipe: 'AlienPowerAugmenter',
      })
      expect(alienPowerFac.power.produced).toBe(1500)
    })

    it('should boost the grid by 30% for the two fueled augmenters and 10% for the dry one', () => {
      expect(alienPowerFac.power.boostFueledBuildings).toBe(2)
      expect(alienPowerFac.power.boostUnfueledBuildings).toBe(1)
      expect(alienPowerFac.power.boostPercent).toBe(0.7) // 2 x 30% + 1 x 10%
    })

    it('should demand matrixes for the fueled augmenters, creating a deliberate shortage', () => {
      expect(alienPowerFac.powerProducers[0].ingredients).toEqual([{ part: 'AlienPowerFuel', perMin: 10 }])
      expect(alienPowerFac.parts.AlienPowerFuel.amountRequiredPower).toBe(10)
      expect(alienPowerFac.parts.AlienPowerFuel.satisfied).toBe(false)
    })

    it('should cost 10 Somersloops per augmenter and no Power Shards', () => {
      expect(getFactorySomersloops(alienPowerFac)).toBe(30) // 3 buildings x 10 to construct
      expect(getFactoryPowerShards(alienPowerFac)).toBe(0) // Augmenters cannot be overclocked
    })
  })

  describe('overclocking', () => {
    it('should keep the Plastic line split of 24 @ 100% and 4 @ 200%, costing 8 shards', () => {
      const plastic = oilFac.products[0]
      expect(plastic.buildingGroups).toHaveLength(2)
      expect(plastic.buildingGroups[0]).toMatchObject({ buildingCount: 24, overclockPercent: 100 })
      expect(plastic.buildingGroups[1]).toMatchObject({ buildingCount: 4, overclockPercent: 200 })
      expect(plastic.amount).toBe(640) // 24 + 4x2 = 32 effective buildings x 20/min
      expect(getFactoryPowerShards(oilFac)).toBe(8) // 4 buildings x 2 shards at 200%
    })

    it('should run the Copper Sheet line at 200%, costing 16 shards', () => {
      const sheets = copperBasicsFac.products[2]
      expect(sheets.buildingGroups).toHaveLength(1)
      expect(sheets.buildingGroups[0]).toMatchObject({ buildingCount: 8, overclockPercent: 200 })
      expect(sheets.amount).toBe(160) // 8 x 2 = 16 effective buildings x 10/min
      expect(getFactoryPowerShards(copperBasicsFac)).toBe(16)
    })
  })

  describe('Geothermal Power', () => {
    it('should have one producer per geyser purity', () => {
      expect(geothermalFac.powerProducers.length).toBe(3)
      expect(geothermalFac.powerProducers[0]).toMatchObject({
        building: 'geothermalgenerator',
        buildingCount: 4,
        powerProduced: 400,
        recipe: 'GeneratorGeoThermal_Impure',
      })
      expect(geothermalFac.powerProducers[1]).toMatchObject({
        buildingCount: 3,
        powerProduced: 600,
        recipe: 'GeneratorGeoThermal_Normal',
      })
      expect(geothermalFac.powerProducers[2]).toMatchObject({
        buildingCount: 2,
        powerProduced: 800,
        recipe: 'GeneratorGeoThermal_Pure',
      })
    })

    it('should produce 1800 MW average with the 0.5x-1.5x oscillation range', () => {
      expect(geothermalFac.power.produced).toBe(1800)
      expect(geothermalFac.power.producedMin).toBe(900)
      expect(geothermalFac.power.producedMax).toBe(2700)
    })
  })

  // The browser loads plans with origin 'recalculate' (building groups sacrosanct). The raw
  // template's fuel generators are defined by power amount only, so their default building
  // groups start with 0 buildings — the degenerate-group healing must rebuild them from the
  // producer instead of syncing the producer's generation down to 0.
  describe('recalculate origin (browser load path)', () => {
    it('should keep all generation when recalculated with sacrosanct groups', () => {
      const freshFactories = complexDemoPlan().getFactories()
      calculateFactories(freshFactories, gameData, { origin: 'recalculate' })

      expect(findFacByName('Oil Processing', freshFactories).power.produced).toBe(500)
      expect(findFacByName('☢️ Uranium Power', freshFactories).power.produced).toBe(25000)
      const alien = findFacByName('Alien Power', freshFactories)
      expect(alien.power.produced).toBe(1500)
      // 70% boost of the whole grid's base generation (500 + 25,000 + 1,500 + 1,800 = 28,800 MW)
      expect(alien.power.boostMw).toBe(20160)
    })
  })
})
