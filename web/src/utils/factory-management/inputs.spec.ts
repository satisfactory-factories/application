import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName, newFactory } from '@/utils/factory-management/factory'
import * as factoryUtils from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import {
  addInputToFactory, calculateAbleToImport,
  calculateImportCandidates,
  calculatePossibleImports, importFactorySelections,
  importPartSelections,
} from '@/utils/factory-management/inputs'
import { getExportableFactories } from '@/utils/factory-management/exports'
import { gameData } from '@/utils/gameData'
import { create290Scenario } from '@/utils/factory-setups/290-multiple-byproduct-imports'
import { create315Scenario } from '@/utils/factory-setups/315-non-exportable-parts-imports'

describe('inputs', () => {
  let mockFactory: Factory
  let mockDependantFactory: Factory

  beforeEach(() => {
    mockFactory = newFactory('Iron Ingots')
    mockDependantFactory = newFactory('Iron Plates')
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
      calculateFactories(factories, gameData, true) // Needed otherwise all inputs get blown away
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
        calculateFactories(factories, gameData, true)
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
        calculateFactories(factories, gameData, true)

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

          calculateFactories(factories, gameData, true)
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
          calculateFactories([fac, sourceFac], gameData, true)

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
        calculateFactories(factories, gameData, true)

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
        calculateFactories(factories, gameData, true)

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
          updated: 'ingredient',
        })
      })
      it('should return noProductsOrProducers if the factory has no products AND no power producers', () => {
        ingotFactory.products = []
        ingotFactory.powerProducers = []
        const result = calculateAbleToImport(ingotFactory, [])
        expect(result).toBe('noProductsOrProducers')
      })
      it('should return rawOnly if the factory is only using raw resources', () => {
        ingotFactory.usingRawResourcesOnly = true
        const result = calculateAbleToImport(ingotFactory, [])
        expect(result).toBe('rawOnly')
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
})
