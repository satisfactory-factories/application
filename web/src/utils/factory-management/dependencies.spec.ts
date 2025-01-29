import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, calculateFactory, findFacByName, newFactory } from '@/utils/factory-management/factory'
import {
  calculateAllDependencies,
  removeFactoryDependants,
  updateDependency,
} from '@/utils/factory-management/dependencies'
import { addInputToFactory, getInput } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'
import { addProductToFactory } from '@/utils/factory-management/products'
import { create251Scenario } from '@/utils/factory-setups/251-multiple-imports'

describe('dependencies', () => {
  let factories: Factory[] = []
  let mockFactory: Factory
  let mockDependantFactory: Factory

  beforeEach(() => {
    mockFactory = newFactory('Iron Ingots')
    mockDependantFactory = newFactory('Iron Plates')
    factories = [mockFactory, mockDependantFactory]
  })

  describe('updateDependency', () => {
    it('should add a dependency between two factories', () => {
      const input = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      }

      expect(() => {
        updateDependency(mockFactory, mockDependantFactory, input)
      }).not.toThrow()

      expect(mockDependantFactory.dependencies.requests[mockFactory.id].length).toBe(1)

      expect(mockDependantFactory.dependencies.requests[mockFactory.id][0].part).toBe('IronIngot')
    })

    it('should return undefined if output part is not supplied', () => {
      const input = {
        factoryId: mockFactory.id,
        outputPart: '',
        amount: 900,
      }

      expect(updateDependency(mockFactory, mockDependantFactory, input)).toBe(undefined)
    })

    it('should return undefined if adding a dependency if one already exists', () => {
      const input = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      }
      const input2 = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      }

      expect(updateDependency(mockFactory, mockDependantFactory, input)).toBe(undefined)
      expect(updateDependency(mockFactory, mockDependantFactory, input2)).toBe(undefined)
    })

    it('should update the dependency if one exists with a new amount', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 1000,
        recipe: 'IngotIron',
      })
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      })
      // Initialize the metrics
      calculateFactories(factories, gameData)

      // Update amount
      getInput(mockDependantFactory, 'IronIngot').amount = 1000

      // Recalculate and check
      calculateFactories(factories, gameData)
      expect(mockFactory.dependencies.requests[mockDependantFactory.id][0].amount).toBe(1000)
      expect(mockFactory.dependencies.metrics.IronIngot.request).toBe(1000)
    })
    it('should make no changes if the inputs have not changed', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 1000,
        recipe: 'IngotIron',
      })
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 1000,
      })
      // Initialize the metrics
      calculateFactories(factories, gameData)
      expect(mockFactory.dependencies.requests[mockDependantFactory.id][0].amount).toBe(1000)
      expect(mockFactory.dependencies.metrics.IronIngot.request).toBe(1000)
    })
    it('should handle multiple inputs from the same factory on the different parts and not mess up any math', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 1000,
        recipe: 'IngotIron',
      })
      addProductToFactory(mockFactory, {
        id: 'CopperIngot',
        amount: 1000,
        recipe: 'IngotCopper',
      })
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 1000,
      })
      // Initialize the metrics
      calculateFactories(factories, gameData)

      // Add a new input on the same part
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'CopperIngot',
        amount: 500,
      })

      // Recalculate and check
      calculateFactories(factories, gameData)
      expect(mockFactory.dependencies.requests[mockDependantFactory.id][0].amount).toBe(1000)
      expect(mockFactory.dependencies.requests[mockDependantFactory.id][1].amount).toBe(500)
      expect(mockFactory.dependencies.metrics.IronIngot.request).toBe(1000)
      expect(mockFactory.dependencies.metrics.CopperIngot.request).toBe(500)
    })
  })

  describe('constructDependencies', () => {
    it('should construct dependencies between factories', () => {
      const input = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      }

      addInputToFactory(mockDependantFactory, input)
      calculateAllDependencies(factories, gameData, true) // Has to be true otherwise imports get removed due to no parts
      expect(mockFactory.dependencies.requests[mockDependantFactory.id].length).toBe(1)
      expect(mockFactory.dependencies.requests[mockDependantFactory.id][0].part).toBe('IronIngot')
    })

    it('should prevent adding dependencies from invalid input data', () => {
      factories.find = vi.fn()
      const input = {
        factoryId: 0,
        outputPart: '',
        amount: 123,
      }
      mockDependantFactory.inputs.push(input)

      calculateAllDependencies(factories, gameData, true)
      // TODO: console.error should be called
      expect(factories.find).toBeCalledTimes(0)
    })

    it('should prevent adding dependencies to itself', () => {
      const input = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      }

      addInputToFactory(mockFactory, input)
      expect(() => {
        calculateAllDependencies(factories, gameData, true)
      }).toThrow()
    })

    it('should prevent adding dependencies when provider factory does not exist', () => {
      const input = {
        factoryId: 1234,
        outputPart: 'IronIngot',
        amount: 900,
      }

      mockDependantFactory.inputs.push(input)
      // It should have force added the input.
      expect(mockDependantFactory.inputs.length).toBe(1)

      calculateAllDependencies(factories, gameData) // Note not true on purpose here to test the factory not existing, parts are not involved.
      // TODO: console.error should be called

      // The invalid input should be removed.
      expect(mockDependantFactory.inputs.length).toBe(0)
      // Ensure no factories have any dependencies
      expect(mockFactory.dependencies.requests).toEqual({})
      expect(mockDependantFactory.dependencies.requests).toEqual({})
    })
  })

  describe('calculateDependencyMetrics', () => {
    it('should calculate the dependency metrics for multiple inputs from a singular factory', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 1000,
        recipe: 'IngotIron',
      })
      addProductToFactory(mockFactory, {
        id: 'CopperIngot',
        amount: 23,
        recipe: 'IngotCopper',
      })
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      })
      addInputToFactory(mockDependantFactory, {
        factoryId: mockFactory.id,
        outputPart: 'CopperIngot',
        amount: 123,
      })

      calculateFactories(factories, gameData)

      expect(mockFactory.dependencies.metrics.IronIngot).toEqual({
        part: 'IronIngot',
        request: 900,
        supply: 1000,
        isRequestSatisfied: true,
        difference: 100,
      })
      expect(mockFactory.dependencies.metrics.CopperIngot).toEqual({
        part: 'CopperIngot',
        request: 123,
        supply: 23,
        isRequestSatisfied: false,
        difference: -100,
      })
    })
    it('should calculate the dependency metrics from multiple inputs from differing factories', () => {
      const mockDependantFactory2 = newFactory('Iron Rods')
      // Ensure the new factory is in the list
      factories = [mockFactory, mockDependantFactory, mockDependantFactory2]

      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 150,
        recipe: 'IngotIron',
      })

      const input = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 100, // This should equal 200 eventually as we have it twice across two factories
      }

      addInputToFactory(mockDependantFactory, input)
      addInputToFactory(mockDependantFactory2, input)

      calculateFactories(factories, gameData)

      expect(mockFactory.dependencies.metrics.IronIngot).toStrictEqual({
        part: 'IronIngot',
        request: 200,
        supply: 150,
        isRequestSatisfied: false,
        difference: -50,
      })
    })
  })

  describe('removeFactoryDependants', () => {
    it('should remove dependants of the factory', () => {
      const input = {
        factoryId: mockFactory.id,
        outputPart: 'IronIngot',
        amount: 900,
      }
      const input2 = {
        factoryId: mockFactory.id,
        outputPart: 'CopperIngot',
        amount: 900,
      }

      addInputToFactory(mockDependantFactory, input)
      addInputToFactory(mockDependantFactory, input2)

      calculateFactories(factories, gameData)

      removeFactoryDependants(mockFactory, factories)

      // Assume the tests work and the dependency is added
      // Now check if the dependant is removed
      expect(mockFactory.dependencies.requests[mockFactory.id]).toBe(undefined)

      // And also check if the input has been filtered from the dependant
      expect(mockDependantFactory.inputs.length).toBe(0)
    })
  })

  describe('flushInvalidRequests', () => {
    it('should remove invalid import requests', () => {
      const factory1 = newFactory('Factory 1')
      const factory2 = newFactory('Factory 2')

      // Legit product that we are requesting.
      addProductToFactory(factory1, {
        id: 'CopperIngot',
        amount: 100,
        recipe: 'IngotCopper',
      })

      // Invalid input, as we are not producing IronIngot in fac 1
      addInputToFactory(factory2, {
        factoryId: factory1.id,
        outputPart: 'IronIngot',
        amount: 100,
      })
      // Valid input
      addInputToFactory(factory2, {
        factoryId: factory1.id,
        outputPart: 'CopperIngot',
        amount: 100,
      })

      factories = [factory1, factory2]

      calculateFactories(factories, gameData)

      expect(factory1.parts.IronIngot).toBe(undefined) // This ensures that we haven't got it as an import anymore
      expect(factory1.parts.CopperIngot.exportable).toBe(true)
      expect(factory1.products.length).toBe(1)
      expect(factory2.inputs.length).toBe(1) // NOT 2
      expect(getInput(factory2, 'CopperIngot').outputPart).toBe('CopperIngot')

      const foundInvalidInput = getInput(factory2, 'IronIngot')
      expect(foundInvalidInput).not.toBeDefined()
    })

    // GH: #378
    it('should handle when the user changes the factoryID of an input', () => {
      const factories = create251Scenario().getFactories()
      const factoryA = findFacByName('Factory A', factories)
      const factoryB = findFacByName('Factory B', factories)
      const factoryC = findFacByName('Factory C', factories)

      calculateFactories(factories, gameData)
      // Remove one of the inputs from Factory C so we're only importing from Factory A
      factoryC.inputs.pop()
      expect(factoryC.inputs[0].factoryId).toBe(factoryA.id)

      // Calculate
      calculateFactories(factories, gameData)

      // Now, change the factoryId of the input to Factory B
      factoryC.inputs[0].factoryId = factoryB.id

      // Recalculate, the function should have detected the change and removed the dependency metrics from Factory A, added them to Factory B, and updated the part metrics.
      calculateFactory(factoryC, factories, gameData)

      // Dependency metrics checks
      expect(factoryA.dependencies.requests[factoryC.id]).toBe(undefined)
      expect(factoryA.dependencies.metrics.CompactedCoal).toBe(undefined)
      expect(factoryA.dependencies.metrics).toEqual({})
      expect(factoryB.dependencies.requests[factoryC.id]).toEqual([{
        requestingFactoryId: factoryC.id,
        part: 'CompactedCoal',
        amount: 540, // NOT 450, because the input swapped factories not quantity.
      }])
      expect(factoryB.dependencies.metrics.CompactedCoal).toEqual({
        part: 'CompactedCoal',
        request: 540,
        supply: 450,
        isRequestSatisfied: false,
        difference: -90,
      })

      // Part metrics checks
      expect(factoryB.parts.CompactedCoal).toEqual({
        amountRequired: 540,
        amountRequiredExports: 540,
        amountRequiredProduction: 0,
        amountRequiredPower: 0,
        amountSupplied: 450,
        amountSuppliedViaInput: 0,
        amountSuppliedViaRaw: 0,
        amountSuppliedViaProduction: 450,
        amountRemaining: -90,
        satisfied: false,
        isRaw: false,
        exportable: true,
      })
      expect(factoryA.parts.CompactedCoal).toEqual({
        amountRequired: 0,
        amountRequiredExports: 0,
        amountRequiredProduction: 0,
        amountRequiredPower: 0,
        amountSupplied: 540,
        amountSuppliedViaInput: 0,
        amountSuppliedViaRaw: 0,
        amountSuppliedViaProduction: 540,
        amountRemaining: 540,
        satisfied: true,
        isRaw: false,
        exportable: true,
      })
    })

    // TODO: Add more tests for if factory is deleted, it's hard to spy on it and my brain is fried.
  })
  // TODO: removeDependency
  // TODO: removeFactoryDependants
  // TODO: calculateFactoryDependencies
})
