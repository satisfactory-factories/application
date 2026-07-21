import { describe, expect, it, vi } from 'vitest'
import { reactive, watch } from 'vue'
import { calculateFactories } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { createStressPlan } from '@/utils/factory-setups/stress-plan'

vi.mock('@/utils/gameDataService', async () => {
  const { gameData } = await import('@/utils/gameData')
  return { fetchGameData: async () => gameData }
})

describe('stress plan', () => {
  it('should build a valid ~124 factory plan that calculates cleanly', () => {
    const factories = createStressPlan(4)
    expect(factories.length).toBeGreaterThanOrEqual(100)

    // Ids must be unique after remapping
    expect(new Set(factories.map(factory => factory.id)).size).toBe(factories.length)

    const started = performance.now()
    calculateFactories(factories, gameData)
    const calcMs = performance.now() - started

    // Every import must still point at an existing factory (the calc engine deletes
    // inputs whose provider is missing — a remap bug would silently strip them).
    const ids = new Set(factories.map(factory => factory.id))
    const inputCount = factories.reduce((sum, factory) => sum + factory.inputs.length, 0)
    expect(inputCount).toBeGreaterThan(100)
    factories.forEach(factory => {
      factory.inputs.forEach(input => {
        expect(input.factoryId === null || ids.has(input.factoryId)).toBe(true)
      })
    })

    console.log(`[stress] ${factories.length} factories, ${inputCount} imports, full calc ${calcMs.toFixed(0)}ms`)
  })

  it('should perform zero reactive writes on a no-op recalculation at this scale', () => {
    const state = reactive({ factories: createStressPlan(4) })
    calculateFactories(state.factories, gameData)

    let fires = 0
    watch(() => state, () => {
      fires++
    }, { deep: true, flush: 'sync' })

    const started = performance.now()
    calculateFactories(state.factories, gameData)
    const recalcMs = performance.now() - started

    expect(fires).toBe(0)
    console.log(`[stress] no-op recalc at ${state.factories.length} factories: ${recalcMs.toFixed(0)}ms, ${fires} watcher fires`)
  })
})
