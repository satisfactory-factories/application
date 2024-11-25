import { newFactory } from '@/utils/factory-management/factory'
import { describe, expect, it } from 'vitest'

describe('Factory Management', () => {
  describe('newFactory', () => {
    it('should create a new factory with a random ID', () => {
      const fac = newFactory('My new factory')
      expect(fac.id).toBeGreaterThan(0)
      expect(fac.name).toBe('My new factory')
      expect(fac.products.length).toBe(0)
    })
  })

  // Todo: Calculation tests
})
