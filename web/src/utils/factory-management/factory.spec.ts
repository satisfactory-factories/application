import { countIncompleteTasks, newFactory } from '@/utils/factory-management/factory'
import { describe, expect, it } from 'vitest'

describe('Factory Management', () => {
  describe('newFactory', () => {
    it('should create a new factory with a random ID', () => {
      const fac = newFactory('My new factory')
      expect(fac.id).toBeGreaterThan(0)
      expect(fac.name).toBe('My new factory')
      expect(fac.products.length).toBe(0)
      expect(fac.tasks.length).toBe(0)
    })
  })

  describe('countIncompleteTasks', () => {
    it('should count the number of incomplete tasks', () => {
      const fac = newFactory('My new factory')
      expect(countIncompleteTasks(fac)).toBe(0)
      fac.tasks.push({ completed: false, title: 'Task 1' })
      expect(countIncompleteTasks(fac)).toBe(1)
      fac.tasks.push({ completed: false, title: 'Task 2' })
      expect(countIncompleteTasks(fac)).toBe(2)
      fac.tasks.push({ completed: false, title: 'Task 3' })
      expect(countIncompleteTasks(fac)).toBe(3)
    })

    it('should not count complete tasks', () => {
      const fac = newFactory('My new factory')
      expect(countIncompleteTasks(fac)).toBe(0)
      fac.tasks.push({ completed: true, title: 'Task 1' })
      expect(countIncompleteTasks(fac)).toBe(0)
      fac.tasks.push({ completed: false, title: 'Task 2' })
      expect(countIncompleteTasks(fac)).toBe(1)
      fac.tasks.push({ completed: true, title: 'Task 3' })
      expect(countIncompleteTasks(fac)).toBe(1)
    })
  })

  // Todo: Calculation tests
})
