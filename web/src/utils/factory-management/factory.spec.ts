import { beforeEach, describe, expect, it } from 'vitest'
import { countActiveTasks, newFactory, regenerateSortOrders, reorderFactory } from '@/utils/factory-management/factory'
import { Factory } from '@/interfaces/planner/FactoryInterface'

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

  describe('countActiveTasks', () => {
    it('should count the number of incomplete tasks', () => {
      const fac = newFactory('My new factory')
      expect(countActiveTasks(fac)).toBe(0)
      fac.tasks.push({ completed: false, title: 'Task 1' })
      expect(countActiveTasks(fac)).toBe(1)
      fac.tasks.push({ completed: false, title: 'Task 2' })
      expect(countActiveTasks(fac)).toBe(2)
      fac.tasks.push({ completed: false, title: 'Task 3' })
      expect(countActiveTasks(fac)).toBe(3)
    })

    it('should not count complete tasks', () => {
      const fac = newFactory('My new factory')
      expect(countActiveTasks(fac)).toBe(0)
      fac.tasks.push({ completed: true, title: 'Task 1' })
      expect(countActiveTasks(fac)).toBe(0)
      fac.tasks.push({ completed: false, title: 'Task 2' })
      expect(countActiveTasks(fac)).toBe(1)
      fac.tasks.push({ completed: true, title: 'Task 3' })
      expect(countActiveTasks(fac)).toBe(1)
    })
  })

  // Todo: Calculation tests

  describe('factory ordering', () => {
    describe('reorderFactory', () => {
      let factories: Factory[]
      let fac1: Factory
      let fac2: Factory
      let fac3: Factory
      beforeEach(() => {
        fac1 = newFactory('Factory 1', 0)
        fac2 = newFactory('Factory 2', 1)
        fac3 = newFactory('Factory 3', 2)
        factories = [fac1, fac2, fac3]
      })
      it('should reorder the factory to the specified position (up)', () => {
        reorderFactory(fac2, 'up', factories)

        expect(fac2.displayOrder).toBe(0)
        expect(fac1.displayOrder).toBe(1)
        expect(fac3.displayOrder).toBe(2)
      })

      it('should reorder the factory to the specified position (down)', () => {
        reorderFactory(fac2, 'down', factories)

        expect(fac1.displayOrder).toBe(0)
        expect(fac3.displayOrder).toBe(1)
        expect(fac2.displayOrder).toBe(2)
      })

      it('should not change anything with an up order on the first factory', () => {
        reorderFactory(fac1, 'up', factories)

        expect(fac1.displayOrder).toBe(0)
        expect(fac2.displayOrder).toBe(1)
        expect(fac3.displayOrder).toBe(2)
      })

      it('should not change anything with a down order on the last factory', () => {
        reorderFactory(fac3, 'down', factories)

        expect(fac1.displayOrder).toBe(0)
        expect(fac2.displayOrder).toBe(1)
        expect(fac3.displayOrder).toBe(2)
      })
    })

    describe('regenerateSortOrders', () => {
      it('should set the displayOrder property on each factory in numerical order', () => {
        const fac1 = newFactory('Factory 1', 1)
        const fac2 = newFactory('Factory 2', 3)
        const fac3 = newFactory('Factory 3', 6)
        const fac4 = newFactory('Factory 4', 13)
        const fac5 = newFactory('Factory 5', 42)

        const factories = [fac1, fac2, fac3, fac4, fac5]

        regenerateSortOrders(factories)

        expect(fac1.displayOrder).toBe(0)
        expect(fac2.displayOrder).toBe(1)
        expect(fac3.displayOrder).toBe(2)
        expect(fac4.displayOrder).toBe(3)
        expect(fac5.displayOrder).toBe(4)
      })

      it('should reorder the factory even if the original order is out of sync', () => {
        const fac1 = newFactory('Factory 1', 2)
        const fac2 = newFactory('Factory 2', 3)
        const fac3 = newFactory('Factory 3', 4)
        const factories = [fac1, fac2, fac3]

        regenerateSortOrders(factories)

        expect(fac1.displayOrder).toBe(0)
        expect(fac2.displayOrder).toBe(1)
        expect(fac3.displayOrder).toBe(2)
      })
    })
  })
})
