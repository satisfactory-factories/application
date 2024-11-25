import { beforeEach, describe, expect, test } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { createNewPart } from '@/utils/factory-management/common'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

describe('common', () => {
  let mockFactory: Factory

  beforeEach(() => {
    mockFactory = newFactory('Test Factory')
    addProductToFactory(mockFactory, {
      id: 'CompactedCoal',
      amount: 1234,
      recipe: 'CompactedCoal',
    })
  })

  describe('createNewPart', () => {
    test('should create a new part', () => {
      const part = 'NewPart'

      createNewPart(mockFactory, part)

      expect(mockFactory.parts[part]).toBeDefined()
    })

    test('should not overwrite existing parts', () => {
      const part = 'CompactedCoal'

      createNewPart(mockFactory, part)
      mockFactory.parts[part].amountRequired = 1234

      createNewPart(mockFactory, part)

      // If it was to make a new one it would be initialized as 0.
      expect(mockFactory.parts[part].amountRequired).toBe(1234)
    })
  })
})
