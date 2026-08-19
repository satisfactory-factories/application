import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName, newFactory } from '@/utils/factory-management/factory'
import * as factoryUtils from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import {
  addInputToFactory, calculateAbleToImport,
  calculateImportCandidates, calculateImportCapacity,
  calculatePossibleImports, canSatisfyImportToCapacity, deleteInputPair, importExceedsCapacity,
  importFactorySelections,
  importPartSelections, importRowId, isDuplicateImport, isImportRedundant, satisfyImport,
  satisfyImportTarget, satisfyImportToCapacity, satisfyImportToCapacityTarget,
  trimImportToCapacity, validateInput,
} from '@/utils/factory-management/inputs'
import { getExportableFactories } from '@/utils/factory-management/exports'
import { gameData } from '@/utils/gameData'
import { create290Scenario } from '@/utils/factory-setups/290-multiple-byproduct-imports'
import { create315Scenario } from '@/utils/factory-setups/315-non-exportable-parts-imports'
import { calculateAllDependencies } from '@/utils/factory-management/dependencies'
import { create324Scenario } from '@/utils/factory-setups/324-redundant-import'
import { create242Scenario } from '@/utils/factory-setups/242-inputs-byproducts'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { createSimple } from '@/utils/factory-setups/simple-plan'
import eventBus from '@/utils/eventBus'

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}))

describe('inputs', () => {
  let mockFactory: Factory
  let mockDependantFactory: Factory

  beforeEach(() => {
    // Explicit ids — newFactory otherwise assigns random ids, which can collide
    // across mock factories and make input-existence checks flake.
    mockFactory = newFactory('Iron Ingots', 0, 101)
    mockDependantFactory = newFactory('Iron Plates', 0, 102)
  })

  describe('addInputToFactory', () => {
    it('should add an input to a factory', () => {
      const input = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      }

      expect(() => {
        addInputToFactory(mockDependantFactory, input)
      }).not.toThrow()

      expect(mockDependantFactory.inputs.length).toBe(1)

      expect(mockDependantFactory.inputs[0].outputPart).toBe('IronIngot')
    })
    it('should prevent duplicate inputs', () => {
      const input = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      }

      addInputToFactory(mockDependantFactory, input)

      expect(() => {
        addInputToFactory(mockDependantFactory, input)
      }).toThrow()
    })
  })

  describe('Import logic', () => {
    let ironIngotFac: Factory
    let ironRodsFac: Factory
    let screwsFac: Factory
    let factories: Factory[]
    beforeEach(() => {
      // Create some factories with exports
      ironIngotFac = newFactory('Iron Ingots', 0, 1)
      ironRodsFac = newFactory('Iron Rods', 0, 3)
      screwsFac = newFactory('Screws', 0, 4)
      addProductToFactory(ironIngotFac, {
        id: 'IronIngot',
        amount: 1000,
        recipe: 'IngotIron',
      })
      addProductToFactory(ironRodsFac, {
        id: 'IronRod',
        amount: 1000,
        recipe: 'IronRod',
      })
      addProductToFactory(screwsFac, {
        id: 'Screw',
        amount: 1000,
        recipe: 'Screw',
      })
      addInputToFactory(ironRodsFac, {
        factoryId: ironIngotFac.id,
        outputPart: 'IronIngot',
        amount: 500,
      })
      factories = [ironIngotFac, ironRodsFac, screwsFac]
      calculateFactories(factories, gameData)
    })

    describe('calculatePossibleImports', () => {
      it('should return empty if there\'s no factories with exports', () => {
        const result = calculatePossibleImports(ironIngotFac, [])
        expect(result).toEqual([])
      })
      it('should return one factory with exportable parts for screws', () => {
        const exportableFactories = getExportableFactories(factories)
        const result = calculatePossibleImports(screwsFac, exportableFactories)

        // So we should see the Iron Rods factory in the result
        expect(result[0].name).toBe('Iron Rods')
      })

      describe('Multiple factories', () => {
        let ironRodsFac2: Factory
        beforeEach(() => {
          // Add another iron rods fac
          ironRodsFac2 = newFactory('Iron Rods 2', 0, 5)
          addProductToFactory(ironRodsFac2, {
            id: 'IronRod',
            amount: 1000,
            recipe: 'IronRod',
          })
          factories.push(ironRodsFac2)
          calculateFactories(factories, gameData)
        })

        it('should return multiple factories with exportable parts for screws', () => {
          const exportableFactories = getExportableFactories(factories)
          const result = calculatePossibleImports(screwsFac, exportableFactories)

          // For the sake of the test sort by name
          result.sort((a, b) => a.name.localeCompare(b.name))

          // So we should see the Iron Rods factory in the result
          expect(result).toHaveLength(2)
          expect(result[0].name).toBe(ironRodsFac.name)
          expect(result[1].name).toBe(ironRodsFac2.name)
        })
      })
    })
    describe('calculateImportCandidates', () => {
      let ironRodsFac2: Factory
      let screwsPossibleImports: Factory[]
      let ironRodsPossibleImports: Factory[]
      beforeEach(() => {
        // Add another iron rods fac
        ironRodsFac2 = newFactory('Iron Rods 2', 0, 5)
        addProductToFactory(ironRodsFac2, {
          id: 'IronRod',
          amount: 1000,
          recipe: 'IronRod',
        })

        // Block off Iron Rods 2 from being selected by adding an input
        addInputToFactory(screwsFac, {
          factoryId: ironRodsFac2.id,
          outputPart: 'IronRod',
          amount: 500,
        })
        factories.push(ironRodsFac2)
        calculateFactories(factories, gameData)
        screwsPossibleImports = calculatePossibleImports(screwsFac, getExportableFactories(factories))
      })
      it('should return an empty array if there are no possible imports', () => {
        const result = calculateImportCandidates(ironIngotFac, [])
        expect(result).toEqual([])
      })

      it('should not select the same factory after it has been selected', () => {
        // We should only see iron rods 1 because 2 is already selected
        const result = calculateImportCandidates(screwsFac, screwsPossibleImports)

        expect(result).toHaveLength(1)
        expect(result[0].name).toBe(ironRodsFac.name)
        expect(result[1]).toBeUndefined()
      })

      it('should return empty if all possible import parts have been exhausted', () => {
        const factories = create315Scenario().getFactories()
        calculateFactories(factories, gameData)

        const aluminiumPartsFac = findFacByName('Aluminium Parts Fac', factories)

        const result = calculateImportCandidates(aluminiumPartsFac, calculatePossibleImports(aluminiumPartsFac, getExportableFactories(factories)))

        expect(result).toHaveLength(0)
      })

      describe('Multiple import candidates', () => {
        beforeEach(() => {
          // Add RIPs to iron rods fac 2. Screws already has iron rods fac 2 selected for Iron Rods, so this factory should show up again in the list.
          addProductToFactory(ironRodsFac2, {
            id: 'IronPlateReinforced',
            amount: 500,
            recipe: 'IronPlateReinforced',
          })
          addProductToFactory(screwsFac, {
            id: 'ModularFrame',
            amount: 500,
            recipe: 'ModularFrame',
          })

          calculateFactories(factories, gameData)
          ironRodsPossibleImports = calculatePossibleImports(ironRodsFac, getExportableFactories(factories))
          screwsPossibleImports = calculatePossibleImports(screwsFac, getExportableFactories(factories))
        })

        it('should still allow a factory to be chosen if a part is already chosen from it', () => {
        // We should see both iron rods facs in the list
          const result = calculateImportCandidates(screwsFac, screwsPossibleImports)

          expect(result).toHaveLength(2)
          expect(result[0].name).toBe(ironRodsFac.name)
          expect(result[1].name).toBe(ironRodsFac2.name)
        })

        it('should not duplicate candidate factories when multiple parts are available', () => {
          // Set up a factory that requires 2 parts from the same factory
          const fac = newFactory('Foo Fac', 0, 0)
          const sourceFac = newFactory('Source Fac', 0, 1)

          // Set up Fac 1 so that it requires Rods and Screws
          addProductToFactory(fac, {
            id: 'ModularFrame',
            amount: 1000,
            recipe: 'ModularFrame',
          })

          // Set up Source Fac so that it produces two parts for the Foo Fac
          addProductToFactory(sourceFac, {
            id: 'IronRod',
            amount: 1000,
            recipe: 'IronRod',
          })
          addProductToFactory(sourceFac, {
            id: 'IronPlateReinforced',
            amount: 1000,
            recipe: 'IronPlateReinforced',
          })

          // Add a blank input to the factory to simulate the user attempting to add one
          addInputToFactory(fac, {
            factoryId: sourceFac.id,
            outputPart: null,
            amount: 0,
          })

          // Set everything up
          calculateFactories([fac, sourceFac], gameData)

          const candidates = calculatePossibleImports(fac, getExportableFactories([sourceFac]))

          // We should only see the source fac once
          expect(candidates).toHaveLength(1)
          expect(candidates[0].name).toBe(sourceFac.name)
        })

        it('should show no candidates if all parts from the input factory have been used', () => {
        // We should see both iron rods facs in the list
          const result = calculateImportCandidates(ironRodsFac, ironRodsPossibleImports)
          expect(result).toHaveLength(0)
        })

        it('should show only the remaining input part from a factory with a selection already', () => {
          // We should expect to see the RIPs from iron rods fac 2.
          // Input Index 1 here is not defined in the factory, so we intend to select the RIPs with this input.
          const result = importPartSelections(ironRodsFac2, screwsFac, 1)
          expect(result).toHaveLength(1)
          expect(result[0]).toBe('IronPlateReinforced')
        })
      })
    })

    describe('importPartSelections', () => {
      it('should inject the currently selected input factory', () => {
        // Set up an input for screws fac to point to iron Rods fac.
        addInputToFactory(screwsFac, {
          factoryId: ironRodsFac.id,
          outputPart: 'IronRod',
          amount: 500,
        })

        const result = importFactorySelections(
          0, // This in effect simulates the user opening or viewing the input selection for the first input
          [ironRodsFac],
          screwsFac,
          [ironRodsFac, screwsFac]
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          title: ironRodsFac.name,
          value: ironRodsFac.id,
        })
      })
      it('should throw error if factory cannot be found', () => {
        // Set up an input for screws fac to point to iron Rods fac.
        addInputToFactory(screwsFac, {
          factoryId: ironRodsFac.id,
          outputPart: 'IronRod',
          amount: 500,
        })

        const findFacSpy = vi.spyOn(factoryUtils, 'findFac').mockImplementation(() => {
          throw new Error('Could not find factory')
        })

        expect(() =>
          importFactorySelections(
            0, // This simulates the user opening or viewing the input selection for the first input
            [ironRodsFac],
            screwsFac,
            [ironRodsFac, screwsFac]
          )
        ).toThrowError()

        // Clean up the spy
        findFacSpy.mockRestore()
      })
      it('should be able to import the same product from multiple factories', () => {
        // Import the scenario, which has two factories producing Iron Ingots, with an iron plate demanding one of each
        const factories = create290Scenario().getFactories()
        const ironIngotFac = findFacByName('Iron Ingots', factories)
        const ironIngotFac2 = findFacByName('Iron Ingots 2', factories)
        const ironPlatesFac = findFacByName('Iron Plates', factories)

        // Calculate factories
        calculateFactories(factories, gameData)

        const importCandidates = calculatePossibleImports(factories[2], getExportableFactories(factories))

        // Now check that we should be able to see the second iron rods fac in the list
        const factoryResult = importFactorySelections(
          1, // This simulates the user opening or viewing the input selection for the first input
          importCandidates,
          screwsFac,
          factories
        )
        expect(factoryResult).toHaveLength(2)
        expect(factoryResult[1].title).toBe('Iron Ingots 2')

        // Now also check that the part for BOTH factories is showing up
        const partResult = importPartSelections(ironIngotFac, ironPlatesFac, 0)
        const partResult2 = importPartSelections(ironIngotFac2, ironPlatesFac, 1)
        expect(partResult).toHaveLength(1)
        expect(partResult2).toHaveLength(1)
        expect(partResult[0]).toBe('IronIngot')
        expect(partResult2[0]).toBe('IronIngot') // #290 bug was here where this was empty as it was already "selected".
        expect(partResult[1]).toBeUndefined()
      })
      it('should not show parts that are not exportable', () => {
        const factories = create315Scenario().getFactories()
        const copperParts = findFacByName('Copper Parts Fac', factories)
        const aluminiumPartsFac = findFacByName('Aluminium Parts Fac', factories)

        // Calculate factories
        calculateFactories(factories, gameData)

        // Now check that we should NOT be able to select copper ingots from the copperPartsFac within aluminiumPartsFac.
        const partResult = importPartSelections(copperParts, aluminiumPartsFac, 1)
        expect(partResult[0]).toStrictEqual('CopperSheet')
        expect(partResult[1]).toBeUndefined()
      })
    })
    describe('calculateAbleToImport', () => {
      let ingotFactory: Factory
      let fuelFactory: Factory
      let fuelGenFactory: Factory
      beforeEach(() => {
        ingotFactory = newFactory('Iron Ingots', 0, 1)
        addProductToFactory(ingotFactory, {
          id: 'IronIngot',
          amount: 1000,
          recipe: 'IngotIron',
        })
        ingotFactory.usingRawResourcesOnly = false

        fuelFactory = newFactory('Fuel Factory', 1, 2)
        fuelGenFactory = newFactory('Fuel Gens', 2, 3)
        addProductToFactory(fuelFactory, {
          id: 'LiquidFuel',
          amount: 1000,
          recipe: 'LiquidFuel',
        })
        addPowerProducerToFactory(fuelGenFactory, {
          building: 'generatorfuel',
          ingredientAmount: 100,
          recipe: 'GeneratorFuel_LiquidFuel',
          updated: FactoryPowerChangeType.Ingredient,
        })
      })
      it('should return noProductsOrProducers if the factory has no products AND no power producers', () => {
        ingotFactory.products = []
        ingotFactory.powerProducers = []
        const result = calculateAbleToImport(ingotFactory, [])
        expect(result).toBe('noProductsOrProducers')
      })
      // A mine's only part is the ore it digs up, and extraction takes no ingredients, so there
      // is nothing it could import however the raw assumption is set.
      it('should return producesRawOnly for a mine', () => {
        const mine = newFactory('Copper Mine', 3, 4)
        addProductToFactory(mine, {
          id: 'OreCopper',
          amount: 120,
          recipe: 'Extract_OreCopper',
        })
        calculateFactories([mine], gameData)

        expect(calculateAbleToImport(mine, [ironIngotFac])).toBe('producesRawOnly')
      })
      // A factory whose demand is entirely raw used to be blocked from importing, because its
      // supply was assumed. Importing from a mine factory is now exactly what it should do.
      it('should offer imports to a factory that only consumes raw resources', () => {
        ingotFactory.usingRawResourcesOnly = true
        expect(calculateAbleToImport(ingotFactory, [ironIngotFac])).toBe(true)
      })
      it('should return noImportFacs if there are no import candidates', () => {
        const result = calculateAbleToImport(ingotFactory, [])
        expect(result).toBe('noImportFacs')
      })
      it('should return true if there are import candidates', () => {
        const result = calculateAbleToImport(ingotFactory, [ironIngotFac])
        expect(result).toBe(true)
      })
      it('should return true if there are only power producers', () => {
        const result = calculateAbleToImport(fuelGenFactory, [fuelFactory])
        expect(result).toBe(true)
      })
    })
  })

  describe('isImportRedundant', () => {
    it('should return null if the input does not exist', () => {
      expect(isImportRedundant(0, mockFactory)).toBe(null)
    })
    it('should return null if the input amount is set to 0', () => {
      mockFactory.inputs[0] = {
        amount: 0,
        outputPart: 'foo',
      } as any
      expect(isImportRedundant(0, mockFactory)).toBe(null)
    })
    it('should return null if the input output part does not exist', () => {
      mockFactory.inputs[0] = {
        factoryId: mockFactory.id,
        outputPart: null,
        amount: 123,
      }
      expect(isImportRedundant(0, mockFactory)).toBe(null)
    })
    it('should return null if the part data does not exist', () => {
      mockFactory.inputs[0] = {
        factoryId: mockFactory.id,
        outputPart: 'foo',
        amount: 123,
      }
      mockFactory.parts = {}
      expect(isImportRedundant(0, mockFactory)).toBe(null)
    })
    it('should return true if there is no requirement for the product', () => {
      mockFactory.inputs[0] = {
        factoryId: mockFactory.id,
        outputPart: 'foo',
        amount: 123,
      }
      mockFactory.parts = {
        foo: {
          amountRequired: 0,
          amountSuppliedViaProduction: 100,
        },
      } as any
      expect(isImportRedundant(0, mockFactory)).toBe(true)
    })
    it('should return true if there is no requirement for import', () => {
      mockFactory.inputs[0] = {
        factoryId: mockFactory.id,
        outputPart: 'foo',
        amount: 123,
      }
      mockFactory.parts = {
        foo: {
          amountRequired: 100,
          amountSuppliedViaProduction: 100,
        },
      } as any
      expect(isImportRedundant(0, mockFactory)).toBe(true)
    })
    it('should not show for singular imports', () => {
      const factories = complexDemoPlan().getFactories()
      const computerFac = findFacByName('Computers (end product)', factories)
      calculateFactories(factories, gameData)

      // Cables should not be redundant
      expect(isImportRedundant(1, computerFac)).toBe(false)
    })

    describe('Internal production', () => {
      let mockFactory2: Factory
      beforeEach(() => {
        mockFactory2 = newFactory('Iron Plates', 0, 103)
        addProductToFactory(mockFactory, {
          id: 'IronIngot',
          amount: 1000,
          recipe: 'IngotIron',
        })
        addInputToFactory(mockFactory2, {
          factoryId: mockFactory.id,
          outputPart: 'IronIngot',
          amount: 500, // It's way too high but the function isn't checking this
        })
        // Create demand for Iron Ingots
        addProductToFactory(mockFactory2, {
          id: 'IronPlate',
          amount: 100,
          recipe: 'IronPlate',
        })
        // Add ingot internal production to factory2
        addProductToFactory(mockFactory2, {
          id: 'IronIngot',
          amount: 100, // This will result in a 50 import deficit
          recipe: 'IngotIron',
        })
        calculateAllDependencies([mockFactory, mockFactory2], gameData, true)
        calculateFactories([mockFactory, mockFactory2], gameData)
      })

      it('should return false if there is no internal production', () => {
        mockFactory2.products[1].amount = 0
        calculateFactories([mockFactory, mockFactory2], gameData)
        expect(isImportRedundant(0, mockFactory2)).toBe(false)
      })
      it('should return false if there is insufficient internal production', () => {
        // Required is 150, produced is 100, should be 50 left needed from imports
        mockFactory2.products[1].amount = 100
        calculateFactories([mockFactory, mockFactory2], gameData)
        expect(isImportRedundant(0, mockFactory2)).toBe(false)
      })
      it('should return true if there is sufficient internal production', () => {
        mockFactory2.products[1].amount = 2000
        calculateFactories([mockFactory, mockFactory2], gameData)
        expect(isImportRedundant(0, mockFactory2)).toBe(true)
      })

      describe('Other imports', () => {
        let mockFactory3: Factory
        beforeEach(() => {
          mockFactory3 = newFactory('Iron Ingots 2', 0, 104)
          addProductToFactory(mockFactory3, {
            id: 'IronIngot',
            amount: 1000,
            recipe: 'IngotIron',
          })
          addInputToFactory(mockFactory2, {
            factoryId: mockFactory3.id,
            outputPart: 'IronIngot',
            amount: 100,
          })
        })

        // Import favouring largest
        it('should return false if the current import is the largest', () => {
          mockFactory2.inputs[0].amount = 40
          mockFactory2.inputs[1].amount = 15
          calculateFactories([mockFactory, mockFactory2, mockFactory3], gameData)

          expect(isImportRedundant(0, mockFactory2)).toBe(false)
        })
        it('should return true if the current import is the smallest', () => {
          mockFactory2.inputs[0].amount = 40
          mockFactory2.inputs[1].amount = 15
          calculateFactories([mockFactory, mockFactory2, mockFactory3], gameData)

          expect(isImportRedundant(1, mockFactory2)).toBe(false)
        })

        // Import redundancy if other imports can satisfy the requirement
        it('should return true if there are other inputs that satisfy the requirement fully', () => {
          mockFactory2.inputs[0].amount = 75 // Satisfies (50) fully
          mockFactory2.inputs[1].amount = 5
          calculateFactories([mockFactory, mockFactory2, mockFactory3], gameData)

          expect(isImportRedundant(1, mockFactory2)).toBe(true)
        })
        it('should return false if other imports do not fully satisfy', () => {
          // Decrease input from factory 2 to be lower than the requirement
          mockFactory2.inputs[0].amount = 40 // Import requirement is 50
          mockFactory2.inputs[1].amount = 24
          calculateFactories([mockFactory, mockFactory2, mockFactory3], gameData)

          // The total requirement is 150, and we have 1000 from the other import. So this import IS redundant.
          expect(isImportRedundant(1, mockFactory2)).toBe(false)
        })

        it('should handle more than 2 inputs correctly', () => {
          const mockFactory4 = newFactory('Iron Ingots 3', 0, 105)
          addProductToFactory(mockFactory4, {
            id: 'IronIngot',
            amount: 1000,
            recipe: 'IngotIron',
          })
          addInputToFactory(mockFactory2, {
            factoryId: mockFactory4.id,
            outputPart: 'IronIngot',
            amount: 100,
          })
          mockFactory2.inputs[0].amount = 75
          mockFactory2.inputs[1].amount = 25
          mockFactory2.inputs[2].amount = 50

          expect(isImportRedundant(2, mockFactory2)).toBe(true)
        })
      })
    })
  })
  describe('satisfyImport', () => {
    let factories: Factory[]
    let ironPlateFac: Factory
    beforeEach(() => {
      factories = create324Scenario().getFactories()
      ironPlateFac = findFacByName('Iron Plates', factories)
    })

    it('should return undefined if there is no outputPart', () => {
      ironPlateFac.inputs[0].outputPart = null
      expect(satisfyImport(0, ironPlateFac)).toBe(null)
    })

    it('should satisfy the import amount when there are no other factories', () => {
      ironPlateFac.inputs[0].amount = 50

      // Remove the additional import in iron plates
      ironPlateFac.inputs = ironPlateFac.inputs.slice(0, 1)

      calculateFactories(factories, gameData)
      satisfyImport(0, ironPlateFac)

      expect(ironPlateFac.inputs[0].amount).toBe(75)
    })
    it('should trim the import amount when there are no other factories', () => {
      ironPlateFac.inputs[0].amount = 100

      // Remove the additional import in iron plates
      ironPlateFac.inputs = ironPlateFac.inputs.slice(0, 1)

      calculateFactories(factories, gameData)
      satisfyImport(0, ironPlateFac)

      expect(ironPlateFac.inputs[0].amount).toBe(75)
    })

    it('should update the import based on other imports', () => {
      // Set up the imports so import index 1 should be 25
      ironPlateFac.inputs[0].amount = 50
      ironPlateFac.inputs[1].amount = 0

      calculateFactories(factories, gameData)
      satisfyImport(1, ironPlateFac)
      expect(ironPlateFac.inputs[0].amount).toBe(50) // Shouldn't have changed
      expect(ironPlateFac.inputs[1].amount).toBe(25)
    })

    it('should do nothing if the requirements are exact', () => {
      // Set up the imports so import index 1 should be 25
      ironPlateFac.inputs[0].amount = 75
      ironPlateFac.inputs[1].amount = 0

      calculateFactories(factories, gameData)
      satisfyImport(1, ironPlateFac)
      expect(ironPlateFac.inputs[0].amount).toBe(75) // Shouldn't have changed
      expect(ironPlateFac.inputs[1].amount).toBe(0)
    })

    it('should not set the updated amount to negative values', () => {
      ironPlateFac.inputs[0].amount = 100
      ironPlateFac.inputs[1].amount = 0

      calculateFactories(factories, gameData)
      // Potentially this could be set to -25 for input 1
      satisfyImport(1, ironPlateFac)

      expect(ironPlateFac.inputs[0].amount).toBe(100) // Shouldn't have changed
      expect(ironPlateFac.inputs[1].amount).toBe(0) // Shouldn't be -25
    })

    describe('Byproduct handling', () => {
      let factories: Factory[]
      beforeEach(() => {
        factories = create242Scenario().getFactories()
        calculateAllDependencies(factories, gameData, true)
        calculateFactories(factories, gameData)
      })

      it('should correctly calculate the import amount for an internally produced import', () => {
        const issueFactory = findFacByName('DMR trimming issue', factories)

        // We should have 40 DarkEnergy in the issue factory as per the template
        expect(issueFactory.inputs[0].amount).toBe(40)

        // Now we should be able to satisfy the import
        satisfyImport(0, issueFactory)

        // The import should now be 5, as 25 is produced internally.
        expect(issueFactory.inputs[0].amount).toBe(5)
      })
    })
  })

  describe('satisfyImportTarget', () => {
    let factories: Factory[]
    let ironPlateFac: Factory
    beforeEach(() => {
      factories = create324Scenario().getFactories()
      ironPlateFac = findFacByName('Iron Plates', factories)
    })

    it('should return null if there is no outputPart', () => {
      ironPlateFac.inputs[0].outputPart = null
      expect(satisfyImportTarget(0, ironPlateFac)).toBe(null)
    })

    it('should report the quantity satisfyImport would set', () => {
      ironPlateFac.inputs = ironPlateFac.inputs.slice(0, 1)
      ironPlateFac.inputs[0].amount = 50
      calculateFactories(factories, gameData)

      expect(satisfyImportTarget(0, ironPlateFac)).toBe(75)
    })

    it('should account for the other imports of the same part', () => {
      ironPlateFac.inputs[0].amount = 50
      ironPlateFac.inputs[1].amount = 0
      calculateFactories(factories, gameData)

      expect(satisfyImportTarget(1, ironPlateFac)).toBe(25)
    })

    it('should never report a negative target', () => {
      ironPlateFac.inputs[0].amount = 100
      ironPlateFac.inputs[1].amount = 0
      calculateFactories(factories, gameData)

      expect(satisfyImportTarget(1, ironPlateFac)).toBe(0)
    })

    it('should agree with what satisfyImport actually sets', () => {
      ironPlateFac.inputs[0].amount = 100
      ironPlateFac.inputs = ironPlateFac.inputs.slice(0, 1)
      calculateFactories(factories, gameData)

      const target = satisfyImportTarget(0, ironPlateFac)
      satisfyImport(0, ironPlateFac)

      expect(ironPlateFac.inputs[0].amount).toBe(target)
    })
  })

  describe('import capacity', () => {
    let factories: Factory[]
    let ingotFac: Factory
    let plateFac: Factory

    // 200 IronPlate needs 300 IronIngot, and the provider only makes 200 of them: the import is
    // asking for a third more than the provider will ever hand over.
    beforeEach(() => {
      ingotFac = newFactory('Iron Ingots', 0, 201)
      plateFac = newFactory('Iron Plates', 1, 202)
      factories = [ingotFac, plateFac]

      addProductToFactory(ingotFac, {
        id: 'IronIngot',
        amount: 200,
        recipe: 'IngotIron',
      })
      addProductToFactory(plateFac, {
        id: 'IronPlate',
        amount: 200,
        recipe: 'IronPlate',
      })
      addInputToFactory(plateFac, {
        factoryId: ingotFac.id,
        outputPart: 'IronIngot',
        amount: 300,
      })

      calculateFactories(factories, gameData)
    })

    describe('calculateImportCapacity', () => {
      it('should return null if there is no outputPart', () => {
        plateFac.inputs[0].outputPart = null
        expect(calculateImportCapacity(0, plateFac, ingotFac)).toBe(null)
      })

      it('should return null if the provider does not have the part', () => {
        delete ingotFac.parts.IronIngot
        expect(calculateImportCapacity(0, plateFac, ingotFac)).toBe(null)
      })

      it('should report everything the provider makes when nothing else claims it', () => {
        expect(calculateImportCapacity(0, plateFac, ingotFac)).toBe(200)
      })

      it("should exclude what the provider's own production consumes", () => {
        // 50 IronRod eats 50 of the provider's own ingots.
        addProductToFactory(ingotFac, {
          id: 'IronRod',
          amount: 50,
          recipe: 'IronRod',
        })
        calculateFactories(factories, gameData)

        expect(calculateImportCapacity(0, plateFac, ingotFac)).toBe(150)
      })

      it("should exclude what the provider's power generation consumes", () => {
        // The provider makes 100 LiquidFuel and burns some of it in its own generator.
        addProductToFactory(ingotFac, {
          id: 'LiquidFuel',
          amount: 100,
          recipe: 'ResidualFuel',
        })
        addPowerProducerToFactory(ingotFac, {
          building: 'generatorfuel',
          powerAmount: 250,
          recipe: 'GeneratorFuel_LiquidFuel',
          updated: FactoryPowerChangeType.Power,
        })
        addPowerProducerToFactory(plateFac, {
          building: 'generatorfuel',
          powerAmount: 250,
          recipe: 'GeneratorFuel_LiquidFuel',
          updated: FactoryPowerChangeType.Power,
        })
        addInputToFactory(plateFac, {
          factoryId: ingotFac.id,
          outputPart: 'LiquidFuel',
          amount: 100,
        })
        calculateFactories(factories, gameData)

        expect(ingotFac.parts.LiquidFuel.amountRequiredPower).toBe(20)
        expect(calculateImportCapacity(1, plateFac, ingotFac)).toBe(80)
      })

      it('should exclude what the provider has already promised to other factories', () => {
        const otherFac = newFactory('Iron Rods', 2, 203)
        factories.push(otherFac)
        addProductToFactory(otherFac, {
          id: 'IronRod',
          amount: 60,
          recipe: 'IronRod',
        })
        addInputToFactory(otherFac, {
          factoryId: ingotFac.id,
          outputPart: 'IronIngot',
          amount: 60,
        })
        calculateFactories(factories, gameData)

        expect(calculateImportCapacity(0, plateFac, ingotFac)).toBe(140)
      })

      it('should exclude the factory\'s other rows against the same provider and part', () => {
        // The UI blocks a second row for the same provider + part, but plans saved before it did
        // (and share links) still carry them, and the provider owes both.
        plateFac.inputs.push({
          factoryId: ingotFac.id,
          outputPart: 'IronIngot',
          amount: 25,
        })
        calculateFactories(factories, gameData)

        expect(calculateImportCapacity(0, plateFac, ingotFac)).toBe(175)
      })

      it('should never report a negative capacity', () => {
        // The provider turns every ingot it makes into rods, leaving nothing to export.
        addProductToFactory(ingotFac, {
          id: 'IronRod',
          amount: 250,
          recipe: 'IronRod',
        })
        calculateFactories(factories, gameData)

        expect(calculateImportCapacity(0, plateFac, ingotFac)).toBe(0)
      })
    })

    describe('importExceedsCapacity', () => {
      it('should be true when the import asks for more than the provider can spare', () => {
        expect(importExceedsCapacity(0, plateFac, ingotFac)).toBe(true)
      })

      it('should be false when the import fits within the capacity', () => {
        plateFac.inputs[0].amount = 200
        calculateFactories(factories, gameData)

        expect(importExceedsCapacity(0, plateFac, ingotFac)).toBe(false)
      })

      it('should be false when there is no capacity at all to trim to', () => {
        addProductToFactory(ingotFac, {
          id: 'IronRod',
          amount: 250,
          recipe: 'IronRod',
        })
        calculateFactories(factories, gameData)

        expect(importExceedsCapacity(0, plateFac, ingotFac)).toBe(false)
      })

      it('should be false while the row is still being filled in', () => {
        plateFac.inputs[0].outputPart = null
        expect(importExceedsCapacity(0, plateFac, ingotFac)).toBe(false)
      })
    })

    describe('trimImportToCapacity', () => {
      it('should return null if there is no outputPart', () => {
        plateFac.inputs[0].outputPart = null
        expect(trimImportToCapacity(0, plateFac, ingotFac)).toBe(null)
      })

      it('should trim the import down to what the provider can spare', () => {
        trimImportToCapacity(0, plateFac, ingotFac)
        expect(plateFac.inputs[0].amount).toBe(200)
      })

      it('should clear the provider\'s shortage once trimmed', () => {
        expect(ingotFac.dependencies.metrics.IronIngot.isRequestSatisfied).toBe(false)

        trimImportToCapacity(0, plateFac, ingotFac)
        calculateFactories(factories, gameData)

        expect(ingotFac.dependencies.metrics.IronIngot.request).toBe(200)
        expect(ingotFac.dependencies.metrics.IronIngot.isRequestSatisfied).toBe(true)
      })

      it('should never grow an import that already fits', () => {
        plateFac.inputs[0].amount = 120
        calculateFactories(factories, gameData)

        trimImportToCapacity(0, plateFac, ingotFac)

        expect(plateFac.inputs[0].amount).toBe(120)
      })
    })

    // The other half of the same question: Trim shrinks a row down to the provider's capacity,
    // this grows a short row up to it. Satisfy on its own would jump straight past the capacity to
    // the full need, which then needs trimming straight back down again.
    describe('satisfy to capacity', () => {
      beforeEach(() => {
        // The shared setup deliberately over-asks; shrink the row so there is room to grow into.
        plateFac.inputs[0].amount = 50
        calculateFactories(factories, gameData)
      })

      describe('satisfyImportToCapacityTarget', () => {
        it('should cap the satisfy target at what the provider can spare', () => {
          expect(satisfyImportTarget(0, plateFac)).toBe(300)
          expect(satisfyImportToCapacityTarget(0, plateFac, ingotFac)).toBe(200)
        })

        it('should be the full need when the provider can cover it', () => {
          ingotFac.products[0].amount = 400
          calculateFactories(factories, gameData)

          expect(satisfyImportToCapacityTarget(0, plateFac, ingotFac)).toBe(300)
        })

        it('should return null while the row is still being filled in', () => {
          plateFac.inputs[0].outputPart = null
          expect(satisfyImportToCapacityTarget(0, plateFac, ingotFac)).toBe(null)
        })
      })

      describe('canSatisfyImportToCapacity', () => {
        it('should offer when the provider cannot cover the whole need', () => {
          expect(canSatisfyImportToCapacity(0, plateFac, ingotFac)).toBe(true)
        })

        it('should not offer when the provider can cover the whole need', () => {
          // Satisfy already lands within capacity, so a second button would set the same figure.
          ingotFac.products[0].amount = 400
          calculateFactories(factories, gameData)

          expect(canSatisfyImportToCapacity(0, plateFac, ingotFac)).toBe(false)
        })

        it('should not offer when the row already asks for more than the capacity', () => {
          // That is Trim to Capacity's job, and it is already on screen saying the same figure.
          plateFac.inputs[0].amount = 300
          calculateFactories(factories, gameData)

          expect(canSatisfyImportToCapacity(0, plateFac, ingotFac)).toBe(false)
        })

        it('should not offer when the row already sits exactly on the capacity', () => {
          plateFac.inputs[0].amount = 200
          calculateFactories(factories, gameData)

          expect(canSatisfyImportToCapacity(0, plateFac, ingotFac)).toBe(false)
        })

        it('should not offer when the provider has nothing spare', () => {
          // A quantity of zero is not a valid import and would only trip validateInput.
          addProductToFactory(ingotFac, {
            id: 'IronRod',
            amount: 250,
            recipe: 'IronRod',
          })
          calculateFactories(factories, gameData)

          expect(canSatisfyImportToCapacity(0, plateFac, ingotFac)).toBe(false)
        })

        it('should not offer while the row is still being filled in', () => {
          plateFac.inputs[0].outputPart = null
          expect(canSatisfyImportToCapacity(0, plateFac, ingotFac)).toBe(false)
        })
      })

      describe('satisfyImportToCapacity', () => {
        it('should grow the import to what the provider can spare', () => {
          satisfyImportToCapacity(0, plateFac, ingotFac)
          expect(plateFac.inputs[0].amount).toBe(200)
        })

        it('should leave the provider fully committed but not over-asked', () => {
          satisfyImportToCapacity(0, plateFac, ingotFac)
          calculateFactories(factories, gameData)

          expect(ingotFac.dependencies.metrics.IronIngot.request).toBe(200)
          expect(ingotFac.dependencies.metrics.IronIngot.isRequestSatisfied).toBe(true)
        })

        it('should leave the importing factory showing the gap it always had', () => {
          satisfyImportToCapacity(0, plateFac, ingotFac)
          calculateFactories(factories, gameData)

          // 300 needed, 200 obtainable: the 100 shortfall stays on the factory that has it,
          // rather than surfacing on the provider as an export request it can never meet.
          expect(plateFac.parts.IronIngot.amountRemaining).toBe(-100)
        })

        it('should stop at the need when the provider can cover more', () => {
          ingotFac.products[0].amount = 400
          calculateFactories(factories, gameData)

          satisfyImportToCapacity(0, plateFac, ingotFac)

          expect(plateFac.inputs[0].amount).toBe(300)
        })

        it('should return null and leave the row alone if there is no target', () => {
          plateFac.inputs[0].outputPart = null

          expect(satisfyImportToCapacity(0, plateFac, ingotFac)).toBe(null)
          expect(plateFac.inputs[0].amount).toBe(50)
        })
      })
    })
  })

  describe('deleteInputPair', () => {
    let factories: Factory[]
    let ingotFac: Factory
    let ironPlateFac: Factory

    beforeEach(() => {
      factories = createSimple().getFactories()
      ingotFac = findFacByName('Iron Ingots', factories)
      ironPlateFac = findFacByName('Iron Plates', factories)

      calculateFactories(factories, gameData)
    })

    it('should properly delete an input from the source factory', () => {
      const input = ironPlateFac.inputs[0]
      deleteInputPair(ironPlateFac, input, factories, gameData)

      expect(ironPlateFac.inputs.length).toBe(0)
    })

    // GH #373
    it('should properly recalculate the iron ingot part demand now it has been deleted', () => {
      const input = ironPlateFac.inputs[0]
      deleteInputPair(ironPlateFac, input, factories, gameData)

      expect(ingotFac.parts.IronIngot.amountRequired).toBe(0)
    })

    it('should not affect other factory dependency pairs', () => {
      // Add a third factory that requires Iron Ingots
      const ironPlateFac2 = newFactory('Iron Plates 2', 0, 106)
      addProductToFactory(ironPlateFac2, {
        id: 'IronPlate',
        amount: 1000,
        recipe: 'IronPlate',
      })
      addInputToFactory(ironPlateFac2, {
        factoryId: ingotFac.id,
        outputPart: 'IronIngot',
        amount: 150,
      })

      factories.push(ironPlateFac2)
      calculateFactories(factories, gameData)

      const input = ironPlateFac.inputs[0]
      deleteInputPair(ironPlateFac, input, factories, gameData)

      expect(ingotFac.parts.IronIngot.amountRequired).toBe(150) // Demand from plate fac 2
      expect(ironPlateFac2.parts.IronIngot.amountSupplied).toBe(150) // Supply from ingots
      expect(ironPlateFac.parts.IronIngot.amountSupplied).toBe(0) // Deleted input factory
    })

    it('should not affect other parts based on the same factory pair', () => {
      // Add a new product to iron ingot fac (copperingots)
      addProductToFactory(ingotFac, {
        id: 'CopperIngot',
        amount: 1000,
        recipe: 'IngotCopper',
      })

      // Add a new input to iron plate fac that requires copper ingots
      addInputToFactory(ironPlateFac, {
        factoryId: ingotFac.id,
        outputPart: 'CopperIngot',
        amount: 100,
      })

      calculateFactories(factories, gameData)

      const input = ironPlateFac.inputs[0] // Iron Ingots
      expect(input.outputPart).toBe('IronIngot')

      deleteInputPair(ironPlateFac, input, factories, gameData)

      expect(ingotFac.parts.IronIngot.amountRequired).toBe(0) // Iron Ingot demand
      expect(ingotFac.parts.CopperIngot.amountRequired).toBe(100) // Copper Ingot demand
      expect(ironPlateFac.parts.IronIngot.amountSupplied).toBe(0) // Iron Ingot removed supply
    })

    // Every unfinished row reads as "null-null", so deleting by factory + part took them all.
    it('should only delete the row it was given when other rows are half-configured', () => {
      addInputToFactory(ironPlateFac, { factoryId: null, outputPart: null, amount: 0 })
      addInputToFactory(ironPlateFac, { factoryId: null, outputPart: null, amount: 0 })

      deleteInputPair(ironPlateFac, ironPlateFac.inputs[2], factories, gameData)

      expect(ironPlateFac.inputs.length).toBe(2)
      expect(ironPlateFac.inputs[0].outputPart).toBe('IronIngot')
    })

    it('should delete a half-configured row without throwing', () => {
      addInputToFactory(ironPlateFac, { factoryId: null, outputPart: null, amount: 0 })

      expect(() => deleteInputPair(ironPlateFac, ironPlateFac.inputs[1], factories, gameData)).not.toThrow()
      expect(ironPlateFac.inputs.length).toBe(1)
    })

    it('should do nothing when the input has already been removed', () => {
      const input = ironPlateFac.inputs[0]
      deleteInputPair(ironPlateFac, input, factories, gameData)

      expect(() => deleteInputPair(ironPlateFac, input, factories, gameData)).not.toThrow()
      expect(ironPlateFac.inputs.length).toBe(0)
    })
  })

  describe('isDuplicateImport', () => {
    it('should detect a second import of the same part from the same factory', () => {
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 100,
      })
      mockDependantFactory.inputs.push({
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 50,
      })

      expect(isDuplicateImport(mockDependantFactory, 1)).toBe(true)
    })

    it('should not flag the same part imported from different factories', () => {
      const otherFactory = newFactory('Other Iron Ingots', 0, 107)
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 100,
      })
      addInputToFactory(mockDependantFactory, {
        factoryId: otherFactory.id,
        outputPart: 'IronIngot',
        amount: 50,
      })

      expect(isDuplicateImport(mockDependantFactory, 1)).toBe(false)
    })

    it('should not flag rows the user is still filling in', () => {
      addInputToFactory(mockDependantFactory, { factoryId: null, outputPart: null, amount: 0 })
      addInputToFactory(mockDependantFactory, { factoryId: null, outputPart: null, amount: 0 })

      expect(isDuplicateImport(mockDependantFactory, 1)).toBe(false)
    })
  })

  describe('importRowId', () => {
    it('should build the id the import row and its jump targets share', () => {
      expect(importRowId(2, 1, 'IronIngot')).toBe('2-import-1-IronIngot')
    })

    it('should give half-configured rows no id, so they cannot collide', () => {
      expect(importRowId(2, null, 'IronIngot')).toBe(null)
      expect(importRowId(2, 1, null)).toBe(null)
      expect(importRowId(2, null, null)).toBe(null)
    })
  })

  describe('validateInput', () => {
    afterEach(() => {
      vi.resetAllMocks()
    })
    it('should properly handle input amounts set to 0', () => {
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 123,
      })
      vi.spyOn(eventBus, 'emit')

      const input = mockDependantFactory.inputs[0]
      input.amount = 0

      // Set the input amount to 0
      validateInput(input)

      expect(input.amount).toBe(1)
      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: 'You cannot set an input quantity to be <=0. Setting to 1 to prevent calculation errors. <br>If you need to enter 0.x of numbers, enter a period then the number e.g. ".5".',
        type: 'warning',
      })
    })
  })
})
