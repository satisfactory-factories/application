import { describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { groupedFactories } from '@/utils/factory-management/factory-groups'
import {
  isPlannerView,
  neighboursOf,
  OVERVIEW,
  parseView,
  serialiseView,
  sidebarOrder,
  viewAfterRemoving,
} from '@/utils/factory-management/planner-view'

const plan = (): Factory[] => [
  newFactory('One', 0, 1),
  newFactory('Two', 1, 2),
  newFactory('Three', 2, 3),
]

describe('planner-view', () => {
  describe('sidebarOrder', () => {
    // Ungrouped first, then each group in its own order: the order the sidebar draws.
    it('walks the sections in the order the sidebar lists them', () => {
      const [one, two, three] = plan()
      const group = { id: 'g1', name: 'Iron', color: '#ff0000', order: 0 }
      one.group = group
      three.group = group

      const order = sidebarOrder(groupedFactories([one, two, three]))

      expect(order.map(factory => factory.name)).toEqual(['Two', 'One', 'Three'])
    })
  })

  describe('neighboursOf', () => {
    it('goes back to the overview from the first factory', () => {
      const factories = plan()

      expect(neighboursOf(factories, 1)).toEqual({ previous: OVERVIEW, next: factories[1] })
    })

    it('has both neighbours in the middle of the plan', () => {
      const factories = plan()

      expect(neighboursOf(factories, 2)).toEqual({ previous: factories[0], next: factories[2] })
    })

    it('has nothing after the last factory', () => {
      const factories = plan()

      expect(neighboursOf(factories, 3)).toEqual({ previous: factories[1], next: null })
    })

    it('treats a factory that is not in the plan as the overview', () => {
      const factories = plan()

      expect(neighboursOf(factories, 99)).toEqual({ previous: OVERVIEW, next: factories[0] })
    })
  })

  describe('viewAfterRemoving', () => {
    it('moves on to the next factory', () => {
      expect(viewAfterRemoving(plan(), 2)).toBe(3)
    })

    it('steps back when the last factory goes', () => {
      expect(viewAfterRemoving(plan(), 3)).toBe(2)
    })

    it('falls back to the overview when the only factory goes', () => {
      expect(viewAfterRemoving([newFactory('Alone', 0, 1)], 1)).toBe(OVERVIEW)
    })
  })

  describe('serialising', () => {
    it('round-trips the overview and a factory id', () => {
      expect(parseView(serialiseView(OVERVIEW))).toBe(OVERVIEW)
      expect(parseView(serialiseView(42))).toBe(42)
    })

    it('rejects anything else', () => {
      expect(parseView('nonsense')).toBeNull()
      expect(isPlannerView('nonsense')).toBe(false)
      expect(isPlannerView(Number.NaN)).toBe(false)
      expect(isPlannerView(7)).toBe(true)
    })
  })
})
