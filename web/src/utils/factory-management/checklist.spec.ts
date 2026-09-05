import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { updateDependency } from '@/utils/factory-management/dependencies'
import { setSyncState } from '@/utils/factory-management/syncState'
import { mockPowerProducer } from '@/utils/factory-management/status-fixtures'
import eventBus from '@/utils/eventBus'
import {
  acknowledgeChecklistDesyncs,
  checklistDesyncChange,
  checklistDesyncReason,
  checklistExportDesync,
  checklistExportKey,
  checklistSummaryState,
  checklistTickTitle,
  countChecklistCompleted,
  countChecklistDesynced,
  countChecklistTotal,
  hasChecklistDesync,
  inputChecklistDesync,
  isChecklistComplete,
  isChecklistExportComplete,
  isChecklistExportDesynced,
  isInputChecklistDesynced,
  isPowerProducerChecklistDesynced,
  isProductChecklistDesynced,
  listChecklistDesyncs,
  powerProducerChecklistDesync,
  productChecklistDesync,
  resetChecklistState,
  setChecklistEnabled,
  setChecklistPanelHidden,
  toggleChecklistExport,
  toggleChecklistInput,
  toggleChecklistPowerProducer,
  toggleChecklistProduct,
} from '@/utils/factory-management/checklist'

describe('checklist', () => {
  describe('checklistExportKey', () => {
    it('combines the requesting factory id and part into a stable key', () => {
      expect(checklistExportKey(42, 'IronPlate')).toBe('42:IronPlate')
    })
  })

  describe('isChecklistExportComplete / toggleChecklistExport', () => {
    it('defaults to incomplete and toggles independently per requesting factory / part pair', () => {
      const factory = newFactory('Provider', 0, 1)

      expect(isChecklistExportComplete(factory, 2, 'IronPlate')).toBe(false)

      toggleChecklistExport(factory, 2, 'IronPlate', 60)
      expect(isChecklistExportComplete(factory, 2, 'IronPlate')).toBe(true)
      // A different requesting factory or part is a different item entirely.
      expect(isChecklistExportComplete(factory, 3, 'IronPlate')).toBe(false)
      expect(isChecklistExportComplete(factory, 2, 'IronRod')).toBe(false)

      toggleChecklistExport(factory, 2, 'IronPlate', 60)
      expect(isChecklistExportComplete(factory, 2, 'IronPlate')).toBe(false)
    })
  })

  describe('countChecklistTotal / countChecklistCompleted', () => {
    it('counts one item per product, power producer, input and export request, and only completed ones as done', () => {
      const provider = newFactory('Provider', 0, 1)
      const consumer = newFactory('Consumer', 1, 2)

      provider.products.push(
        { id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true, completed: true },
        { id: 'IronRod', recipe: 'IronRod', amount: 50, displayOrder: 1, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true, completed: false }
      )
      provider.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200, completed: true })
      provider.powerProducers.push(mockPowerProducer('generatorcoal', { completed: true }))

      // Two exports from provider to consumer.
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60, completed: false })
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronRod', amount: 20, completed: false })

      expect(countChecklistTotal(provider)).toBe(6) // 2 products + 1 power producer + 1 input + 2 export requests

      toggleChecklistExport(provider, consumer.id, 'IronPlate', 60)

      expect(countChecklistCompleted(provider)).toBe(4) // IronPlate product + generator + IronIngot input + IronPlate export
    })
  })

  describe('isChecklistComplete', () => {
    it('is false for an empty factory rather than reading an untouched checklist as done', () => {
      const factory = newFactory('Empty', 0, 1)
      expect(isChecklistComplete(factory)).toBe(false)
    })

    it('is true only once every product, power producer and input is ticked', () => {
      const factory = newFactory('Solo', 0, 1)
      factory.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true, completed: false })
      factory.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200, completed: true })

      expect(isChecklistComplete(factory)).toBe(false)

      factory.products[0].completed = true

      expect(isChecklistComplete(factory)).toBe(true)
    })
  })

  describe('desync tracking', () => {
    it('toggleChecklistProduct stamps a baseline on check, and the item desyncs once amount drifts from it', () => {
      const factory = newFactory('Provider', 0, 1)
      const product: FactoryItem = { id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true }

      // Never checked: not desynced, whatever the amount does.
      expect(isProductChecklistDesynced(product)).toBe(false)

      toggleChecklistProduct(factory, product)
      expect(product.completed).toBe(true)
      expect(isProductChecklistDesynced(product)).toBe(false)

      product.amount = 99
      expect(isProductChecklistDesynced(product)).toBe(true)

      // Clicking a desynced item re-baselines it in place: it stays ticked, not "unbuilt". A click
      // here used to uncheck it, which read as unbuilding something the player already confirmed.
      toggleChecklistProduct(factory, product)
      expect(product.completed).toBe(true)
      expect(isProductChecklistDesynced(product)).toBe(false)

      // Once it reads as in sync again, a click behaves like any other tick and genuinely unchecks it.
      toggleChecklistProduct(factory, product)
      expect(product.completed).toBe(false)
    })

    it('toggleChecklistInput and toggleChecklistPowerProducer follow the same rule', () => {
      const factory = newFactory('Provider', 0, 1)
      const input = { factoryId: 99, outputPart: 'IronIngot', amount: 400 }
      toggleChecklistInput(factory, input)
      expect(isInputChecklistDesynced(input)).toBe(false)
      input.amount = 399
      expect(isInputChecklistDesynced(input)).toBe(true)

      const producer = mockPowerProducer('generatorcoal', { buildingAmount: 4 })
      toggleChecklistPowerProducer(factory, producer)
      expect(isPowerProducerChecklistDesynced(producer)).toBe(false)
      producer.buildingAmount = 5
      expect(isPowerProducerChecklistDesynced(producer)).toBe(true)
    })

    it('toggleChecklistExport stamps and drifts the same way, independently per requesting factory / part pair', () => {
      const factory = newFactory('Provider', 0, 1)

      toggleChecklistExport(factory, 2, 'IronPlate', 60)
      expect(isChecklistExportDesynced(factory, 2, 'IronPlate', 60)).toBe(false)
      expect(isChecklistExportDesynced(factory, 2, 'IronPlate', 45)).toBe(true)
      // Not checked at all: never desynced, regardless of amount.
      expect(isChecklistExportDesynced(factory, 3, 'IronPlate', 999)).toBe(false)
    })

    it('setSyncState re-baselines every product, power producer, input and export in one go', () => {
      const provider = newFactory('Provider', 0, 1)
      const consumer = newFactory('Consumer', 1, 2)

      provider.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })
      provider.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200 })
      provider.powerProducers.push(mockPowerProducer('generatorcoal', { buildingAmount: 4 }))
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60 })

      toggleChecklistProduct(provider, provider.products[0])
      toggleChecklistInput(provider, provider.inputs[0])
      toggleChecklistPowerProducer(provider, provider.powerProducers[0])
      toggleChecklistExport(provider, consumer.id, 'IronPlate', 60)

      // Drift every one of them.
      provider.products[0].amount = 99
      provider.inputs[0].amount = 199
      provider.powerProducers[0].buildingAmount = 5
      const request = provider.dependencies.requests[consumer.id][0]
      request.amount = 45

      expect(isProductChecklistDesynced(provider.products[0])).toBe(true)
      expect(isInputChecklistDesynced(provider.inputs[0])).toBe(true)
      expect(isPowerProducerChecklistDesynced(provider.powerProducers[0])).toBe(true)
      expect(isChecklistExportDesynced(provider, consumer.id, 'IronPlate', 45)).toBe(true)

      setSyncState(provider)

      expect(isProductChecklistDesynced(provider.products[0])).toBe(false)
      expect(isInputChecklistDesynced(provider.inputs[0])).toBe(false)
      expect(isPowerProducerChecklistDesynced(provider.powerProducers[0])).toBe(false)
      expect(isChecklistExportDesynced(provider, consumer.id, 'IronPlate', 45)).toBe(false)
      // The ticks themselves are untouched by a factory-level sync — only the baselines move.
      expect(provider.products[0].completed).toBe(true)
      expect(provider.inputs[0].completed).toBe(true)
      expect(provider.powerProducers[0].completed).toBe(true)
      expect(isChecklistExportComplete(provider, consumer.id, 'IronPlate')).toBe(true)
    })
  })
  // The point of keeping the baseline is being able to say WHAT moved, not just that something
  // did: "Coal export 560 -> 720/min" is actionable, "desynced" is not.
  describe('desync reasons', () => {
    it('reports the pair of numbers behind each kind of desync, with the right unit', () => {
      const factory = newFactory('Provider', 0, 1)

      const product: FactoryItem = { id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true }
      toggleChecklistProduct(factory, product)
      expect(productChecklistDesync(product)).toBeNull()
      product.amount = 150
      expect(productChecklistDesync(product)).toEqual({ from: 100, to: 150, unit: 'perMin' })

      const input = { factoryId: 99, outputPart: 'IronIngot', amount: 400 }
      toggleChecklistInput(factory, input)
      input.amount = 380
      expect(inputChecklistDesync(input)).toEqual({ from: 400, to: 380, unit: 'perMin' })

      // A generator's baseline is a building count, not a rate. The unit travels with the numbers
      // so a chip cannot label four generators as 4/min.
      const producer = mockPowerProducer('generatorcoal', { buildingAmount: 4 })
      toggleChecklistPowerProducer(factory, producer)
      producer.buildingAmount = 6
      expect(powerProducerChecklistDesync(producer)).toEqual({ from: 4, to: 6, unit: 'buildings' })

      toggleChecklistExport(factory, 2, 'Coal', 560)
      expect(checklistExportDesync(factory, 2, 'Coal', 560)).toBeNull()
      expect(checklistExportDesync(factory, 2, 'Coal', 720)).toEqual({ from: 560, to: 720, unit: 'perMin' })
      // Never ticked: no reason to report, whatever the amount does.
      expect(checklistExportDesync(factory, 3, 'Coal', 720)).toBeNull()
    })

    it('phrases the change for a chip and the reason for a tooltip', () => {
      // Both sides carry the unit: "560 → 720/min" reads as though only the second were a rate.
      expect(checklistDesyncChange({ from: 560, to: 720, unit: 'perMin' })).toBe('560/min → 720/min')
      expect(checklistDesyncChange({ from: 4, to: 6, unit: 'buildings' })).toBe('4 buildings → 6 buildings')
      expect(checklistDesyncChange({ from: 2, to: 1, unit: 'buildings' })).toBe('2 buildings → 1 building')

      const reason = checklistDesyncReason({ from: 560, to: 720, unit: 'perMin' })
      expect(reason).toContain('560/min')
      expect(reason).toContain('720/min')

      // The inline ticks have no room for a chip, so they carry the same sentence — and their
      // ordinary label when there is nothing to say.
      expect(checklistTickTitle(null, 'Mark this product as built')).toBe('Mark this product as built')
      expect(checklistTickTitle({ from: 560, to: 720, unit: 'perMin' }, 'Mark this product as built')).toBe(reason)
    })

    it('lists every desynced row in the factory, tagged with what it is and what it points at', () => {
      const provider = newFactory('Provider', 0, 1)
      const consumer = newFactory('Consumer', 1, 2)

      provider.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })
      provider.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200 })
      provider.powerProducers.push(mockPowerProducer('generatorcoal', { buildingAmount: 4 }))
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60 })

      toggleChecklistProduct(provider, provider.products[0])
      toggleChecklistInput(provider, provider.inputs[0])
      toggleChecklistPowerProducer(provider, provider.powerProducers[0])
      toggleChecklistExport(provider, consumer.id, 'IronPlate', 60)

      expect(listChecklistDesyncs(provider)).toEqual([])
      expect(countChecklistDesynced(provider)).toBe(0)

      provider.products[0].amount = 120
      provider.inputs[0].amount = 240
      provider.powerProducers[0].buildingAmount = 5
      provider.dependencies.requests[consumer.id][0].amount = 45

      expect(listChecklistDesyncs(provider)).toEqual([
        { kind: 'product', part: 'IronPlate', desync: { from: 100, to: 120, unit: 'perMin' } },
        { kind: 'power', building: 'generatorcoal', desync: { from: 4, to: 5, unit: 'buildings' } },
        { kind: 'import', part: 'IronIngot', factoryId: 99, desync: { from: 200, to: 240, unit: 'perMin' } },
        { kind: 'export', part: 'IronPlate', factoryId: consumer.id, desync: { from: 60, to: 45, unit: 'perMin' } },
      ])
      expect(countChecklistDesynced(provider)).toBe(4)
    })

    it('acknowledgeChecklistDesyncs re-baselines every moved row and leaves untouched ones alone', () => {
      const provider = newFactory('Provider', 0, 1)
      const consumer = newFactory('Consumer', 1, 2)

      provider.products.push(
        { id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true },
        { id: 'IronRod', recipe: 'IronRod', amount: 50, displayOrder: 1, requirements: {}, buildingRequirements: { name: 'constructormk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true },
      )
      provider.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200 })
      provider.powerProducers.push(mockPowerProducer('generatorcoal', { buildingAmount: 4 }))
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60 })

      toggleChecklistProduct(provider, provider.products[0])
      toggleChecklistInput(provider, provider.inputs[0])
      toggleChecklistPowerProducer(provider, provider.powerProducers[0])
      toggleChecklistExport(provider, consumer.id, 'IronPlate', 60)

      provider.products[0].amount = 120
      provider.inputs[0].amount = 240
      provider.powerProducers[0].buildingAmount = 5
      provider.dependencies.requests[consumer.id][0].amount = 45

      acknowledgeChecklistDesyncs(provider)

      expect(hasChecklistDesync(provider)).toBe(false)
      // Acknowledging is not ticking: the never-ticked product stays unticked and unbaselined, so
      // it cannot start reading as desynced later off a baseline it never asked for.
      expect(provider.products[1].completed).toBeFalsy()
      expect(provider.products[1].checklistSyncedAmount).toBeUndefined()
      // And the ticks that were already there stay ticked.
      expect(provider.products[0].completed).toBe(true)
      expect(isChecklistExportComplete(provider, consumer.id, 'IronPlate')).toBe(true)
    })
  })

  // Every checklist mutation has to dirty the plan. Nothing else does it for them: the cloud
  // dirty flag and the local persist both hang off `factoryUpdated`, and checklist mode is the
  // one feature where a whole session can be nothing but ticks. Without this a build session
  // uploads nothing and a second device silently overwrites it.
  describe('persistence signalling', () => {
    let emitted: string[]

    beforeEach(() => {
      emitted = []
      vi.spyOn(eventBus, 'emit').mockImplementation((event: any) => {
        emitted.push(event)
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('every checklist mutation declares payload and intent', () => {
      const factory = newFactory('Provider', 0, 1)
      factory.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })
      factory.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200 })
      factory.powerProducers.push(mockPowerProducer('generatorcoal', { buildingAmount: 4 }))

      toggleChecklistProduct(factory, factory.products[0])
      toggleChecklistInput(factory, factory.inputs[0])
      toggleChecklistPowerProducer(factory, factory.powerProducers[0])
      toggleChecklistExport(factory, 2, 'IronPlate', 60)
      setChecklistEnabled(factory, true)
      setChecklistPanelHidden(factory, true)

      // Payload alone schedules the save; only the intent survives a rebase, and a build
      // session made of nothing but ticks has no other edit to ride back on.
      expect(emitted).toEqual(Array(6).fill(['factoryUpdated', 'factoryEdited']).flat())
    })

    /**
     * Acknowledging arrived while the intent layer was being built on another branch, so
     * it emitted payload only. Re-baselining every moved row is a write like any other:
     * without the intent a rebase carries the plan over without the new baselines, and
     * every row the player just acknowledged reads as desynced all over again.
     */
    it('acknowledging a set of desyncs declares them too', () => {
      const factory = newFactory('Provider', 0, 1)
      factory.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })

      toggleChecklistProduct(factory, factory.products[0])
      factory.products[0].amount = 120
      emitted = []

      acknowledgeChecklistDesyncs(factory)

      expect(factory.products[0].checklistSyncedAmount).toBe(120)
      expect(emitted).toEqual(['factoryUpdated', 'factoryEdited'])
    })

    it('unticking dirties the plan too, not only ticking', () => {
      const factory = newFactory('Provider', 0, 1)
      factory.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200 })

      toggleChecklistInput(factory, factory.inputs[0])
      emitted = []
      toggleChecklistInput(factory, factory.inputs[0])

      expect(factory.inputs[0].completed).toBe(false)
      expect(emitted).toEqual(['factoryUpdated', 'factoryEdited'])
    })
  })

  // A clone's buildings do not exist in the world, so nothing about it is built yet. Export ticks
  // are the sharp edge: they key on (importer, part) rather than on anything belonging to this
  // factory, so an uncleared one lies dormant while the clone has no dependants and springs back
  // the moment that same importer buys that same part from the clone.
  describe('resetChecklistState', () => {
    it('clears every tick and baseline, including dormant export keys', () => {
      const provider = newFactory('Provider', 0, 1)
      const consumer = newFactory('Consumer', 1, 2)

      provider.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })
      provider.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200 })
      provider.powerProducers.push(mockPowerProducer('generatorcoal', { buildingAmount: 4 }))
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60 })

      toggleChecklistProduct(provider, provider.products[0])
      toggleChecklistInput(provider, provider.inputs[0])
      toggleChecklistPowerProducer(provider, provider.powerProducers[0])
      toggleChecklistExport(provider, consumer.id, 'IronPlate', 60)
      expect(isChecklistComplete(provider)).toBe(true)

      resetChecklistState(provider)

      expect(provider.products[0].completed).toBe(false)
      expect(provider.products[0].checklistSyncedAmount).toBeUndefined()
      expect(provider.inputs[0].completed).toBe(false)
      expect(provider.inputs[0].checklistSyncedAmount).toBeUndefined()
      expect(provider.powerProducers[0].completed).toBe(false)
      expect(provider.powerProducers[0].checklistSyncedAmount).toBeUndefined()
      expect(provider.checklistExports).toEqual({})
      expect(provider.checklistExportSyncedAmounts).toEqual({})
      expect(countChecklistCompleted(provider)).toBe(0)
      expect(isChecklistComplete(provider)).toBe(false)
    })

    it('an export tick cleared while dormant does not resurrect when that importer returns', () => {
      const provider = newFactory('Provider', 0, 1)
      const consumer = newFactory('Consumer', 1, 2)

      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60 })
      toggleChecklistExport(provider, consumer.id, 'IronPlate', 60)

      // Stand in for the clone: dependencies torn down, exactly as copyFactory leaves them.
      provider.dependencies = { requests: {}, metrics: {} }
      resetChecklistState(provider)

      // The same importer buys the same part again.
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60 })

      expect(isChecklistExportComplete(provider, consumer.id, 'IronPlate')).toBe(false)
      expect(isChecklistComplete(provider)).toBe(false)
    })
  })

  // The per-row "Desynced" chips only render inside an expanded factory card, so the collapsed
  // header and the sidebar need a state of their own or they assert the opposite of the rows.
  describe('checklistSummaryState / hasChecklistDesync', () => {
    const providerWithTickedProduct = () => {
      const provider = newFactory('Provider', 0, 1)
      provider.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })
      toggleChecklistProduct(provider, provider.products[0])
      return provider
    }

    it('reads incomplete while anything is unticked', () => {
      const provider = newFactory('Provider', 0, 1)
      provider.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })

      expect(hasChecklistDesync(provider)).toBe(false)
      expect(checklistSummaryState(provider)).toBe('incomplete')
    })

    it('reads complete once everything is ticked and nothing has moved', () => {
      expect(checklistSummaryState(providerWithTickedProduct())).toBe('complete')
    })

    it('a fully ticked factory whose numbers moved reads desynced, not complete', () => {
      const provider = providerWithTickedProduct()
      provider.products[0].amount = 250

      // The count deliberately still says N/N: the tick stands until the player acknowledges it.
      expect(isChecklistComplete(provider)).toBe(true)
      expect(hasChecklistDesync(provider)).toBe(true)
      expect(checklistSummaryState(provider)).toBe('desynced')
    })

    it('desync outranks complete for a partly ticked factory too', () => {
      const provider = providerWithTickedProduct()
      provider.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200 })
      provider.products[0].amount = 250

      expect(isChecklistComplete(provider)).toBe(false)
      expect(checklistSummaryState(provider)).toBe('desynced')
    })

    it('a desynced export alone is enough to flip the summary', () => {
      const provider = newFactory('Provider', 0, 1)
      const consumer = newFactory('Consumer', 1, 2)
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60 })
      toggleChecklistExport(provider, consumer.id, 'IronPlate', 60)
      expect(checklistSummaryState(provider)).toBe('complete')

      provider.dependencies.requests[consumer.id][0].amount = 45
      expect(checklistSummaryState(provider)).toBe('desynced')
    })

    it('acknowledging a desync by re-ticking returns the summary to complete', () => {
      const provider = providerWithTickedProduct()
      provider.products[0].amount = 250
      expect(checklistSummaryState(provider)).toBe('desynced')

      // One click re-acknowledges a desynced item now, not the old check-and-uncheck dance.
      toggleChecklistProduct(provider, provider.products[0])

      expect(checklistSummaryState(provider)).toBe('complete')
    })
  })

  // Re-acknowledging the last desynced checklist item is, in effect, the player reviewing the
  // whole plan by hand — the same thing clicking the "Out of sync with game" chip does. This
  // should only ever opt a factory back IN, never opt one in that never asked for game-sync
  // tracking in the first place (inSync === null).
  describe('re-acknowledging a desync reconciles game sync state', () => {
    it('flips an out-of-sync factory back to in sync once its last checklist desync clears', () => {
      const factory = newFactory('Provider', 0, 1)
      factory.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })
      toggleChecklistProduct(factory, factory.products[0])

      factory.inSync = false
      factory.products[0].amount = 150
      expect(isProductChecklistDesynced(factory.products[0])).toBe(true)

      toggleChecklistProduct(factory, factory.products[0])

      expect(isProductChecklistDesynced(factory.products[0])).toBe(false)
      expect(factory.inSync).toBe(true)
    })

    it('leaves a factory that never opted into game sync alone (inSync stays null)', () => {
      const factory = newFactory('Provider', 0, 1)
      factory.products.push({ id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true })
      toggleChecklistProduct(factory, factory.products[0])

      factory.products[0].amount = 150
      toggleChecklistProduct(factory, factory.products[0])

      expect(factory.inSync).toBeNull()
    })

    it('does not flip an out-of-sync factory back while another item is still desynced', () => {
      const factory = newFactory('Provider', 0, 1)
      factory.products.push(
        { id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true },
        { id: 'IronRod', recipe: 'IronRod', amount: 50, displayOrder: 1, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true }
      )
      toggleChecklistProduct(factory, factory.products[0])
      toggleChecklistProduct(factory, factory.products[1])

      factory.inSync = false
      factory.products[0].amount = 150
      factory.products[1].amount = 60

      // Acknowledge only the first: the second is still desynced, so game sync should stay off.
      toggleChecklistProduct(factory, factory.products[0])

      expect(isProductChecklistDesynced(factory.products[0])).toBe(false)
      expect(isProductChecklistDesynced(factory.products[1])).toBe(true)
      expect(factory.inSync).toBe(false)
    })
  })
})
