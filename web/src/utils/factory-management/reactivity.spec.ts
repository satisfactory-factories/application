import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, toRaw } from 'vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory, deleteInputPair } from '@/utils/factory-management/inputs'
import { removeFactoryDependants } from '@/utils/factory-management/dependencies'
import { gameData } from '@/utils/gameData'

// The calculation engine clones the plan with structuredClone, which throws on a Proxy.
// Assigning the result of reactiveArray.filter() back onto a reactive object stores the
// proxies filter() read out as the new array's elements, so the next recalculation dies.
// These specs run against reactive factories, the way the app does.
describe('reactive plan handling', () => {
  let factories: Factory[]
  let ingots: Factory
  let copper: Factory
  let plates: Factory
  let rods: Factory

  const rawPlan = () => toRaw(factories).map(factory => toRaw(factory))

  // cloneForCalculation falls back to a deep unwrap and logs when it meets a proxy. The
  // fallback is a net, not the fix — if it fires, something stored one it shouldn't have.
  let errorSpy: ReturnType<typeof vi.spyOn>

  const expectNoProxyFallback = () => {
    const fallbacks = errorSpy.mock.calls.filter(([message]: unknown[]) =>
      typeof message === 'string' && message.includes('cloneForCalculation'))
    expect(fallbacks).toEqual([])
  }

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    ingots = newFactory('Iron Ingots', 0, 1)
    copper = newFactory('Copper Ingots', 1, 2)
    plates = newFactory('Iron Plates', 2, 3)
    rods = newFactory('Iron Rods', 3, 4)

    addProductToFactory(ingots, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
    addProductToFactory(copper, { id: 'CopperIngot', amount: 1000, recipe: 'IngotCopper' })
    addProductToFactory(plates, { id: 'IronPlate', amount: 300, recipe: 'IronPlate' })
    addProductToFactory(plates, { id: 'Wire', amount: 100, recipe: 'Wire' })
    addProductToFactory(rods, { id: 'IronRod', amount: 300, recipe: 'IronRod' })

    // The dependants keep an import after the deleted factory's ones are filtered out —
    // an emptied array has no elements left to be proxies, so it hides the problem.
    addInputToFactory(plates, { factoryId: ingots.id, outputPart: 'IronIngot', amount: 450 })
    addInputToFactory(plates, { factoryId: copper.id, outputPart: 'CopperIngot', amount: 100 })
    addInputToFactory(rods, { factoryId: ingots.id, outputPart: 'IronIngot', amount: 300 })

    factories = reactive([ingots, copper, plates, rods]) as Factory[]
    ingots = factories[0]
    copper = factories[1]
    plates = factories[2]
    rods = factories[3]

    calculateFactories(factories, gameData)
    errorSpy.mockClear()
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('leaves a plan the calculation engine can clone', () => {
    expect(() => structuredClone(rawPlan())).not.toThrow()
  })

  // GH: deleting a factory rewrote its dependants' inputs arrays, which is what stored
  // the proxies; the recalculation immediately after then threw and never completed.
  it('survives deleting a factory that supplies others', () => {
    removeFactoryDependants(ingots, factories)
    factories.splice(factories.indexOf(ingots), 1)

    expect(() => structuredClone(rawPlan())).not.toThrow()
    expect(() => calculateFactories(factories, gameData)).not.toThrow()
    expectNoProxyFallback()
  })

  it('survives deleting an import', () => {
    deleteInputPair(plates, plates.inputs[0], factories, gameData)

    expect(() => structuredClone(rawPlan())).not.toThrow()
    expect(() => calculateFactories(factories, gameData)).not.toThrow()
    expectNoProxyFallback()
  })

  it('survives deleting the last factory a dependant imports from', () => {
    removeFactoryDependants(copper, factories)
    factories.splice(factories.indexOf(copper), 1)

    expect(() => structuredClone(rawPlan())).not.toThrow()
    expect(() => calculateFactories(factories, gameData)).not.toThrow()
    expectNoProxyFallback()
  })

  it('survives an input whose provider has gone missing', () => {
    plates.inputs.push({ factoryId: 4321, outputPart: 'IronIngot', amount: 100 })
    calculateFactories(factories, gameData)

    expect(() => structuredClone(rawPlan())).not.toThrow()
    expectNoProxyFallback()
  })

  it('survives an input for a part the provider does not make', () => {
    plates.inputs.push({ factoryId: ingots.id, outputPart: 'CopperIngot', amount: 100 })
    calculateFactories(factories, gameData)

    expect(() => structuredClone(rawPlan())).not.toThrow()
    expectNoProxyFallback()
  })

  // The net, for a site that forgets rawArray: the plan still calculates, loudly.
  it('recovers when a proxy has been stored in the plan anyway', () => {
    plates.inputs = plates.inputs.filter(() => true)
    expect(() => structuredClone(rawPlan())).toThrow()

    expect(() => calculateFactories(factories, gameData)).not.toThrow()
    expect(errorSpy.mock.calls.some(([message]: unknown[]) =>
      typeof message === 'string' && message.includes('cloneForCalculation'))).toBe(true)
    expect(plates.parts.IronIngot.amountSupplied).toBe(450)
  })

  it('recalculates correctly after a supplier is deleted', () => {
    removeFactoryDependants(ingots, factories)
    factories.splice(factories.indexOf(ingots), 1)
    calculateFactories(factories, gameData)

    expect(plates.inputs).toHaveLength(1)
    expect(plates.inputs[0].outputPart).toBe('CopperIngot')
    expect(rods.inputs).toHaveLength(0)
    expect(plates.parts.IronIngot.amountSupplied).toBe(0)
    expectNoProxyFallback()
  })
})
