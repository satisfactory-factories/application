import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import {
  calculateFactories,
  calculateFactory,
  findFacByName,
  generateFactoryId,
  newFactory,
} from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory, deleteInputPair } from '@/utils/factory-management/inputs'
import { removeFactoryDependants } from '@/utils/factory-management/dependencies'
import { findDependencyChainViolations } from '@/utils/factory-management/dependency-integrity'
import {
  mergeDuplicateInputs,
  repairDuplicateFactoryIds,
  validateFactories,
} from '@/utils/factory-management/validation'
import { gameData } from '@/utils/gameData'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { expectIntegrity } from '../../../testing/dependency-integrity'

// A "ghost export" is a provider factory still advertising an export that the importing
// factory never asked for (or no longer asks for). Every case below mimics something the
// planner UI does; after the mutation and the recalculation it triggers, the export side
// and the import side must still agree.
describe('export / import chain integrity', () => {
  let ingots: Factory
  let plates: Factory
  let rods: Factory
  let factories: Factory[]

  beforeEach(() => {
    ingots = newFactory('Iron Ingots', 0, 1)
    plates = newFactory('Iron Plates', 1, 2)
    rods = newFactory('Iron Rods', 2, 3)

    addProductToFactory(ingots, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
    addProductToFactory(ingots, { id: 'CopperIngot', amount: 1000, recipe: 'IngotCopper' })
    addProductToFactory(plates, { id: 'IronPlate', amount: 300, recipe: 'IronPlate' })
    addProductToFactory(rods, { id: 'IronRod', amount: 300, recipe: 'IronRod' })

    addInputToFactory(plates, { factoryId: ingots.id, outputPart: 'IronIngot', amount: 450 })
    addInputToFactory(rods, { factoryId: ingots.id, outputPart: 'IronIngot', amount: 300 })

    factories = [ingots, plates, rods]
    calculateFactories(factories, gameData)
  })

  it('starts from a consistent plan', () => {
    expectIntegrity(factories)
    expect(ingots.dependencies.requests[plates.id]).toHaveLength(1)
    expect(ingots.dependencies.requests[rods.id]).toHaveLength(1)
  })

  describe('deleting an import', () => {
    it('removes the export when deleted through deleteInputPair', () => {
      deleteInputPair(plates, plates.inputs[0], factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toBeUndefined()
      expect(ingots.dependencies.metrics.IronIngot.request).toBe(300)
    })

    it('removes the export when the input is spliced out and the plan recalculated', () => {
      plates.inputs.splice(0, 1)
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toBeUndefined()
    })

    it('removes the export when only the importing factory is recalculated', () => {
      plates.inputs.splice(0, 1)
      calculateFactory(plates, factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toBeUndefined()
    })

    it('removes the export when only the exporting factory is recalculated', () => {
      plates.inputs.splice(0, 1)
      calculateFactory(ingots, factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toBeUndefined()
    })

    it('keeps the other importer intact', () => {
      deleteInputPair(plates, plates.inputs[0], factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[rods.id]).toHaveLength(1)
      expect(rods.inputs).toHaveLength(1)
    })

    // Every half-configured row reads as null-null, so matching on factory + part took
    // all of them at once.
    it('only deletes the row that was clicked when other imports are half-configured', () => {
      addInputToFactory(plates, { factoryId: null, outputPart: null, amount: 0 })
      addInputToFactory(plates, { factoryId: null, outputPart: null, amount: 0 })

      deleteInputPair(plates, plates.inputs[1], factories, gameData)

      expectIntegrity(factories)
      expect(plates.inputs).toHaveLength(2)
      expect(plates.inputs[0].outputPart).toBe('IronIngot')
    })

    it('does not throw when the row being deleted was never assigned a factory', () => {
      addInputToFactory(plates, { factoryId: null, outputPart: null, amount: 0 })

      expect(() => deleteInputPair(plates, plates.inputs[1], factories, gameData)).not.toThrow()
      expect(plates.inputs).toHaveLength(1)
    })
  })

  describe('editing an import', () => {
    it('mirrors a quantity change onto the export', () => {
      plates.inputs[0].amount = 120
      calculateFactory(plates, factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id][0].amount).toBe(120)
    })

    it('mirrors a quantity of zero onto the export', () => {
      plates.inputs[0].amount = 0
      calculateFactory(plates, factories, gameData)

      expectIntegrity(factories)
    })

    it('moves the export when the part is changed', () => {
      plates.inputs[0].outputPart = 'CopperIngot'
      calculateFactory(plates, factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toHaveLength(1)
      expect(ingots.dependencies.requests[plates.id][0].part).toBe('CopperIngot')
    })

    it('moves the export when the provider factory is changed', () => {
      const otherIngots = newFactory('Other Iron Ingots', 3, 4)
      addProductToFactory(otherIngots, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
      factories.push(otherIngots)
      calculateFactories(factories, gameData)

      plates.inputs[0].factoryId = otherIngots.id
      calculateFactory(plates, factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toBeUndefined()
      expect(otherIngots.dependencies.requests[plates.id]).toHaveLength(1)
    })
  })

  describe('editing the exporting factory', () => {
    it('drops the export when the exported product is removed', () => {
      ingots.products = ingots.products.filter(product => product.id !== 'IronIngot')
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toBeUndefined()
      expect(plates.inputs).toHaveLength(0)
      expect(rods.inputs).toHaveLength(0)
    })

    it('drops the export when the exported product is removed and only that factory recalculates', () => {
      ingots.products = ingots.products.filter(product => product.id !== 'IronIngot')
      calculateFactory(ingots, factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toBeUndefined()
    })

    it('keeps the export when the exported product merely drops below demand', () => {
      ingots.products[0].amount = 10
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toHaveLength(1)
      expect(ingots.dependencies.metrics.IronIngot.isRequestSatisfied).toBe(false)
    })
  })

  describe('deleting a factory', () => {
    it('leaves no exports behind when the importing factory is deleted', () => {
      const index = factories.findIndex(fac => fac.id === plates.id)
      removeFactoryDependants(plates, factories)
      factories.splice(index, 1)
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[plates.id]).toBeUndefined()
    })

    it('leaves no imports behind when the exporting factory is deleted', () => {
      const index = factories.findIndex(fac => fac.id === ingots.id)
      removeFactoryDependants(ingots, factories)
      factories.splice(index, 1)
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
      expect(plates.inputs).toHaveLength(0)
      expect(rods.inputs).toHaveLength(0)
    })
  })

  describe('copying a factory', () => {
    it('does not carry the original factory exports onto the copy', () => {
      const copy: Factory = {
        ...structuredClone(ingots),
        id: 9999,
        name: 'Iron Ingots (copy)',
        displayOrder: 3,
      }
      factories.push(copy)
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
      expect(copy.dependencies.requests).toEqual({})
    })

    it('carries the imports of a copied consumer through to the provider', () => {
      const copy: Factory = {
        ...structuredClone(plates),
        id: 9999,
        name: 'Iron Plates (copy)',
        displayOrder: 3,
      }
      factories.push(copy)
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
      expect(ingots.dependencies.requests[copy.id]).toHaveLength(1)
    })
  })

  describe('recovering a corrupted plan', () => {
    it('flushes an export whose import was never saved', () => {
      ingots.dependencies.requests[plates.id].push({
        requestingFactoryId: plates.id,
        part: 'CopperIngot',
        amount: 100,
      })
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
    })

    // An empty array still renders the importing factory's name under "Exports:".
    it('flushes an export key left with no requests', () => {
      rods.dependencies.requests[plates.id] = []
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
      expect(rods.dependencies.requests[plates.id]).toBeUndefined()
    })

    it('flushes an export pointing at a factory that no longer exists', () => {
      ingots.dependencies.requests[4321] = [{
        requestingFactoryId: 4321,
        part: 'IronIngot',
        amount: 100,
      }]
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
    })

    it('flushes an import pointing at a factory that no longer exists', () => {
      plates.inputs.push({ factoryId: 4321, outputPart: 'IronIngot', amount: 100 })
      calculateFactories(factories, gameData)

      expectIntegrity(factories)
    })

    it('totals duplicate imports of the same part into a single export', () => {
      plates.inputs.push({ factoryId: ingots.id, outputPart: 'IronIngot', amount: 50 })
      calculateFactories(factories, gameData)

      expect(ingots.dependencies.requests[plates.id]).toHaveLength(1)
      expect(ingots.dependencies.requests[plates.id][0].amount).toBe(500)
      expect(ingots.dependencies.metrics.IronIngot.request).toBe(800)
    })

    it('does not abort the whole plan over an input that references its own factory', () => {
      plates.inputs.push({ factoryId: plates.id, outputPart: 'IronPlate', amount: 10 })

      expect(() => calculateFactories(factories, gameData)).not.toThrow()
      expectIntegrity(factories)
    })
  })

  // A template, or any plan built in code, arrives with its exports written but no part
  // ledger. "This factory doesn't make that" cannot be concluded from an empty ledger — it
  // is built moments later — and doing so tore up perfectly good links on the first pass.
  describe('a plan that has never been calculated', () => {
    let plan: Factory[]

    beforeEach(() => {
      const supplier = newFactory('Ingots', 0, 11)
      const consumer = newFactory('Plates', 1, 12)
      addProductToFactory(supplier, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
      addProductToFactory(consumer, { id: 'IronPlate', amount: 300, recipe: 'IronPlate' })
      addInputToFactory(consumer, { factoryId: supplier.id, outputPart: 'IronIngot', amount: 450 })
      supplier.dependencies.requests[consumer.id] = [{
        requestingFactoryId: consumer.id,
        part: 'IronIngot',
        amount: 450,
      }]

      plan = [supplier, consumer]
    })

    it('keeps the links it was given', () => {
      calculateFactories(plan, gameData)

      expectIntegrity(plan)
      expect(plan[1].inputs).toHaveLength(1)
      expect(plan[0].dependencies.requests[plan[1].id]).toHaveLength(1)
    })

    // The flush recalculates mid-loop, so a bad link elsewhere used to take the good ones
    // with it: that recalculation ran against factories whose ledgers were still empty.
    it('keeps them even when another factory in the plan holds a ghost export', () => {
      const stray = newFactory('Stray copy', 2, 13)
      stray.dependencies.requests[plan[1].id] = [{
        requestingFactoryId: plan[1].id,
        part: 'IronIngot',
        amount: 450,
      }]
      plan.push(stray)

      calculateFactories(plan, gameData)

      expectIntegrity(plan)
      expect(plan[1].inputs).toHaveLength(1)
      expect(stray.dependencies.requests).toEqual({})
    })
  })

  describe('the complex demo plan', () => {
    it('is internally consistent after a full recalculation', () => {
      const plan = complexDemoPlan().getFactories()
      calculateFactories(plan, gameData)

      expectIntegrity(plan)
    })

    it('stays consistent as each factory is deleted in turn', () => {
      const plan = complexDemoPlan().getFactories()
      calculateFactories(plan, gameData)

      while (plan.length > 0) {
        const factory = plan[0]
        removeFactoryDependants(factory, plan)
        plan.splice(0, 1)
        calculateFactories(plan, gameData)

        expectIntegrity(plan)
      }
    })

    it('stays consistent as each import is deleted in turn', () => {
      const plan = complexDemoPlan().getFactories()
      calculateFactories(plan, gameData)

      plan.filter(factory => factory.inputs.length > 0).forEach(factory => {
        while (factory.inputs.length > 0) {
          deleteInputPair(factory, factory.inputs[0], plan, gameData)
          expectIntegrity(plan)
        }
      })
    })

    it('stays consistent when an exported product is deleted', () => {
      const plan = complexDemoPlan().getFactories()
      calculateFactories(plan, gameData)

      const oil = findFacByName('Oil Processing', plan)
      oil.products.splice(0, 1)
      calculateFactory(oil, plan, gameData)

      expectIntegrity(plan)
    })
  })
})

describe('factory IDs', () => {
  it('never issues an ID already in the plan', () => {
    const taken = Array.from({ length: 500 }, (_, index) => ({ id: index + 1 } as Factory))
    const takenIds = new Set(taken.map(factory => factory.id))

    for (let attempt = 0; attempt < 500; attempt++) {
      expect(takenIds.has(generateFactoryId(taken))).toBe(false)
    }
  })

  // Rather than spinning forever once every ID is spoken for.
  it('widens the ID space when it is saturated', () => {
    const taken = Array.from({ length: 10000 }, (_, index) => ({ id: index + 1 } as Factory))

    expect(generateFactoryId(taken)).toBeGreaterThan(10000)
  })

  // findFac and the input validation both read 0 as "no factory selected".
  it('never issues 0', () => {
    for (let attempt = 0; attempt < 2000; attempt++) {
      expect(generateFactoryId([])).toBeGreaterThan(0)
    }
  })

  it('repairs a plan whose factories share an ID', () => {
    const a = newFactory('Ingots', 0, 1)
    const b = newFactory('Plates', 1, 2)
    const c = newFactory('Rods', 2, 2) // The collision
    const factories = [a, b, c]

    const repairs = repairDuplicateFactoryIds(factories)

    expect(repairs).toHaveLength(1)
    expect(b.id).toBe(2)
    expect(c.id).not.toBe(2)
    expect(new Set(factories.map(factory => factory.id)).size).toBe(3)
  })
})

describe('load-time repairs', () => {
  // A collision makes both factories' exports indistinguishable — the provider ends up
  // holding one request covering two different importers.
  it('separates colliding factories and rebuilds their exports', () => {
    const ingots = newFactory('Ingots', 0, 1)
    const plates = newFactory('Plates', 1, 2)
    const rods = newFactory('Rods', 2, 2) // Same ID as plates

    addProductToFactory(ingots, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
    addProductToFactory(plates, { id: 'IronPlate', amount: 100, recipe: 'IronPlate' })
    addProductToFactory(rods, { id: 'IronRod', amount: 100, recipe: 'IronRod' })
    plates.inputs.push({ factoryId: ingots.id, outputPart: 'IronIngot', amount: 150 })
    rods.inputs.push({ factoryId: ingots.id, outputPart: 'IronIngot', amount: 100 })

    const factories = [ingots, plates, rods]
    repairDuplicateFactoryIds(factories)
    calculateFactories(factories, gameData)

    expectIntegrity(factories)
    expect(ingots.dependencies.requests[plates.id][0].amount).toBe(150)
    expect(ingots.dependencies.requests[rods.id][0].amount).toBe(100)
    expect(ingots.dependencies.metrics.IronIngot.request).toBe(250)
  })

  it('merges duplicate imports rather than letting the export understate demand', () => {
    const ingots = newFactory('Ingots', 0, 1)
    const plates = newFactory('Plates', 1, 2)
    plates.inputs.push({ factoryId: ingots.id, outputPart: 'IronIngot', amount: 300 })
    plates.inputs.push({ factoryId: ingots.id, outputPart: 'IronIngot', amount: 200 })

    const repairs = mergeDuplicateInputs([ingots, plates], gameData)

    expect(repairs).toHaveLength(1)
    expect(plates.inputs).toHaveLength(1)
    expect(plates.inputs[0].amount).toBe(500)
  })

  it('leaves half-configured import rows alone', () => {
    const factory = newFactory('Plates', 0, 1)
    factory.inputs.push({ factoryId: null, outputPart: null, amount: 0 })
    factory.inputs.push({ factoryId: null, outputPart: null, amount: 0 })

    expect(mergeDuplicateInputs([factory], gameData)).toEqual([])
    expect(factory.inputs).toHaveLength(2)
  })

  it('repairs and reports a persisted ghost export on load', () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})
    alertMock.mockClear()

    const ingots = newFactory('Ingots', 0, 1)
    const plates = newFactory('Plates', 1, 2)
    addProductToFactory(ingots, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
    addProductToFactory(plates, { id: 'IronPlate', amount: 100, recipe: 'IronPlate' })
    addInputToFactory(plates, { factoryId: ingots.id, outputPart: 'IronIngot', amount: 150 })

    const factories = [ingots, plates]
    calculateFactories(factories, gameData)

    // The saved plan looks fully calculated, so nothing would recalculate it on load.
    plates.inputs = []

    expect(findDependencyChainViolations(factories)).not.toEqual([])
    const repairs = validateFactories(factories, gameData)
    expect(repairs).toHaveLength(1)
    expect(repairs[0].summary).toContain('is not importing it')
    // Repairs are reported through the plan-repair dialog, never a browser alert.
    expect(alertMock).not.toHaveBeenCalled()

    calculateFactories(factories, gameData)
    expectIntegrity(factories)

    alertMock.mockRestore()
  })

  it('reports nothing when the plan is already consistent', () => {
    const plan = complexDemoPlan().getFactories()
    calculateFactories(plan, gameData)

    expect(validateFactories(plan, gameData)).toEqual([])
  })

  it('does not throw on a plan saved mid-way through adding an import', () => {
    const factory = newFactory('Plates', 0, 1)
    addProductToFactory(factory, { id: 'IronPlate', amount: 100, recipe: 'IronPlate' })
    factory.inputs.push({ factoryId: null, outputPart: null, amount: 0 })

    expect(() => validateFactories([factory], gameData)).not.toThrow()
    expect(factory.inputs).toHaveLength(1)
  })
  // flushInvalidRequests decides whether it may judge a provider's outputs at all. It used to
  // infer that from the part ledger being non-empty, which is a different question:
  // calculateFactoryDependencies fills a provider's `parts` as a side effect while processing a
  // CONSUMER, but `byProducts` is only written by the provider's own pass. So a provider sitting
  // after its consumer in the array arrived half-done and had its export silently deleted.
  describe('order independence of the byproduct check', () => {
    const buildOilChain = () => {
      const oil = newFactory('Oil', 0, 11)
      const consumer = newFactory('Rubber', 1, 12)
      // Plastic emits Heavy Oil Residue as a byproduct - the array the check reads.
      addProductToFactory(oil, { id: 'Plastic', amount: 300, recipe: 'Plastic' })
      addProductToFactory(consumer, { id: 'Rubber', amount: 100, recipe: 'ResidualRubber' })
      addInputToFactory(consumer, { factoryId: oil.id, outputPart: 'HeavyOilResidue', amount: 100 })
      return { oil, consumer }
    }

    it('keeps a byproduct import with the provider first', () => {
      const { oil, consumer } = buildOilChain()
      const plan = [oil, consumer]
      calculateFactories(plan, gameData)

      expect(consumer.inputs).toHaveLength(1)
      expect(oil.dependencies.requests[consumer.id]).toHaveLength(1)
      expectIntegrity(plan)
    })

    it('keeps the same byproduct import with the provider last', () => {
      const { oil, consumer } = buildOilChain()
      const plan = [consumer, oil]
      calculateFactories(plan, gameData)

      expect(consumer.inputs).toHaveLength(1)
      expect(oil.dependencies.requests[consumer.id]).toHaveLength(1)
      expectIntegrity(plan)
    })
  })
  // Every other spec in this repo builds plans as PLAIN arrays, where a Vue proxy and its raw
  // object are the same thing. The app never does: the store's plan is reactive, so reading an
  // element out of it hands back a proxy while the calculation engine reads through toRaw. A
  // pass-completion mark stamped on the proxy is invisible to the next calculation, which then
  // treats a long-calculated plan as brand new and skips the very check that prunes dead exports.
  describe('on a reactive plan, as the app has', () => {
    it('still prunes an export whose product has gone', () => {
      const provider = newFactory('Iron Ingots', 0, 21)
      const consumer = newFactory('Iron Plates', 1, 22)
      addProductToFactory(provider, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
      addProductToFactory(consumer, { id: 'IronPlate', amount: 300, recipe: 'IronPlate' })
      addInputToFactory(consumer, { factoryId: provider.id, outputPart: 'IronIngot', amount: 450 })

      const plan = reactive([provider, consumer])
      calculateFactories(plan, gameData)
      expect(plan[1].inputs).toHaveLength(1)

      // The provider stops making it, and only the provider recalculates - what Planner.vue does.
      plan[0].products[0].id = 'CopperIngot'
      plan[0].products[0].recipe = 'IngotCopper'
      calculateFactory(plan[0], plan, gameData)

      expect(plan[1].inputs).toHaveLength(0)
      expect(plan[1].parts.IronIngot?.amountSupplied ?? 0).toBe(0)
      expect(plan[1].requirementsSatisfied).toBe(false)
    })
  })
})
