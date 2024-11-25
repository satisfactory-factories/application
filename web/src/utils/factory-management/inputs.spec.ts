import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addInputToFactory } from '@/utils/factory-management/inputs'

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
})
