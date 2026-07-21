// Tests for the clone-run-commit behaviour of calculateFactory / calculateFactories:
// the engine runs against a plain clone and only genuine changes are written back to
// the (reactive) plan, so watchers fire proportionally to real changes — not churn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, watch } from 'vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, calculateFactory, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { createMaelsBigBoiPlan } from '@/utils/factory-setups/maels-big-boi-plan'
import eventBus from '@/utils/eventBus'

vi.mock('@/utils/gameDataService', async () => {
  const { gameData } = await import('@/utils/gameData')
  return { fetchGameData: async () => gameData }
})

// Installs a deep sync watcher over the plan — the same shape as Vue Devtools' pinia
// $subscribe and the app's localStorage persistence watcher — and counts its fires.
const watchPlan = (state: object) => {
  const counter = { fires: 0 }
  watch(() => state, () => {
    counter.fires++
  }, { deep: true, flush: 'sync' })
  return counter
}

describe('calculateFactories clone-run-commit', () => {
  describe('correctness and idempotence', () => {
    it('should produce identical results when run twice (idempotent)', () => {
      const factories = complexDemoPlan().getFactories()
      calculateFactories(factories, gameData)
      const first = JSON.stringify(factories)
      calculateFactories(factories, gameData)
      expect(JSON.stringify(factories)).toBe(first)
    })

    it('should calculate the demo plan to known values through the commit path', () => {
      const factories = complexDemoPlan().getFactories()
      calculateFactories(factories, gameData)

      const copperIngots = findFacByName('Copper Ingots', factories)
      expect(copperIngots.parts.CopperIngot.amountSuppliedViaProduction).toBe(320)
      expect(copperIngots.hasProblem).toBe(false)
    })
  })

  describe('reactive write behaviour', () => {
    let state: { factories: Factory[] }

    beforeEach(() => {
      state = reactive({ factories: complexDemoPlan().getFactories() })
      calculateFactories(state.factories, gameData)
    })

    it('should perform zero reactive writes on a recalculation that changes nothing', () => {
      const counter = watchPlan(state)
      calculateFactories(state.factories, gameData)
      expect(counter.fires).toBe(0)
    })

    it('should write proportionally to the change when one product amount is edited', () => {
      const copperIngots = findFacByName('Copper Ingots', state.factories)
      const counter = watchPlan(state)

      copperIngots.products[0].amount += 10
      calculateFactories(state.factories, gameData)

      // The edit ripples to this factory's parts/exports and its consumers' metrics.
      // Exact counts may drift slightly as the engine evolves; the invariant that matters
      // is orders of magnitude below full-churn (~2,400 fires for this plan pre-commit).
      expect(counter.fires).toBeGreaterThan(0)
      expect(counter.fires).toBeLessThan(100)
      expect(copperIngots.parts.CopperIngot.amountSuppliedViaProduction).toBe(330)
    })

    it('should preserve object identity of parts across recalculations', () => {
      const copperIngots = findFacByName('Copper Ingots', state.factories)
      const partsBefore = copperIngots.parts
      const partBefore = copperIngots.parts.CopperIngot

      copperIngots.products[0].amount += 10
      calculateFactories(state.factories, gameData)

      expect(copperIngots.parts).toBe(partsBefore)
      expect(copperIngots.parts.CopperIngot).toBe(partBefore)
    })

    it('should support single-factory calculation through calculateFactory', () => {
      const copperIngots = findFacByName('Copper Ingots', state.factories)
      const counter = watchPlan(state)

      copperIngots.products[0].amount += 10
      calculateFactory(copperIngots, state.factories, gameData)

      expect(copperIngots.parts.CopperIngot.amountSuppliedViaProduction).toBe(330)
      expect(counter.fires).toBeGreaterThan(0)
      expect(counter.fires).toBeLessThan(100)
    })
  })

  describe('event emissions', () => {
    const factoryUpdatedIds: number[] = []
    let calculationsCompleted = 0
    const onFactoryUpdated = (factory: Factory) => {
      factoryUpdatedIds.push(factory.id)
    }
    const onCalculationsCompleted = () => {
      calculationsCompleted++
    }

    beforeEach(() => {
      factoryUpdatedIds.length = 0
      calculationsCompleted = 0
      eventBus.on('factoryUpdated', onFactoryUpdated)
      eventBus.on('calculationsCompleted', onCalculationsCompleted)
    })

    afterEach(() => {
      eventBus.off('factoryUpdated', onFactoryUpdated)
      eventBus.off('calculationsCompleted', onCalculationsCompleted)
    })

    it('should emit factoryUpdated with the live objects, not clones', () => {
      const factories = complexDemoPlan().getFactories()
      const received: Factory[] = []
      const capture = (factory: Factory) => {
        received.push(factory)
      }
      eventBus.on('factoryUpdated', capture)
      calculateFactories(factories, gameData)
      eventBus.off('factoryUpdated', capture)

      expect(received.length).toBeGreaterThan(0)
      received.forEach(factory => {
        expect(factories.includes(factory)).toBe(true)
      })
    })

    it('should not emit factoryUpdated for factories a no-op recalculation left unchanged', () => {
      const factories = complexDemoPlan().getFactories()
      calculateFactories(factories, gameData)

      factoryUpdatedIds.length = 0
      calculationsCompleted = 0
      calculateFactories(factories, gameData)

      expect(factoryUpdatedIds).toEqual([])
      expect(calculationsCompleted).toBe(1)
    })

    it('should always emit factoryUpdated for the directly calculated factory', () => {
      const factories = complexDemoPlan().getFactories()
      calculateFactories(factories, gameData)
      const copperIngots = findFacByName('Copper Ingots', factories)

      factoryUpdatedIds.length = 0
      // No data change at all — the edited factory must still be reported so sync
      // picks up whatever caller-side edit preceded the calculation.
      calculateFactory(copperIngots, factories, gameData)

      expect(factoryUpdatedIds).toContain(copperIngots.id)
    })
  })

  describe('data integrity', () => {
    it('should survive previousInputs aliasing the inputs array', () => {
      const factories = complexDemoPlan().getFactories()
      const computers = findFacByName('Computers (end product)', factories)
      computers.previousInputs = computers.inputs // The legacy alias from setFactories

      calculateFactories(factories, gameData)

      const inputsJson = JSON.stringify(computers.inputs)
      calculateFactories(factories, gameData)
      expect(JSON.stringify(computers.inputs)).toBe(inputsJson)
      expect(computers.inputs.length).toBeGreaterThan(0)
    })
  })

  describe('large plan', () => {
    it('should calculate a large real-world plan with zero-write no-op recalcs', () => {
      const state = reactive({ factories: createMaelsBigBoiPlan() })
      calculateFactories(state.factories, gameData)

      const counter = watchPlan(state)
      calculateFactories(state.factories, gameData)
      expect(counter.fires).toBe(0)
    })
  })
})
