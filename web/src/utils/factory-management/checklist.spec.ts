import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { updateDependency } from '@/utils/factory-management/dependencies'
import { setSyncState } from '@/utils/factory-management/syncState'
import { mockPowerProducer } from '@/utils/factory-management/status-fixtures'
import eventBus from '@/utils/eventBus'
import {
  checklistExportKey,
  checklistSummaryState,
  countChecklistCompleted,
  countChecklistTotal,
  hasChecklistDesync,
  isChecklistComplete,
  isChecklistExportComplete,
  isChecklistExportDesynced,
  isInputChecklistDesynced,
  isPowerProducerChecklistDesynced,
  isProductChecklistDesynced,
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

      // Unchecking hides the flag (nothing checked, nothing to desync) without touching the baseline.
      toggleChecklistProduct(factory, product)
      expect(isProductChecklistDesynced(product)).toBe(false)

      // Re-checking re-baselines against the new amount — the "check and uncheck to acknowledge" path.
      toggleChecklistProduct(factory, product)
      expect(isProductChecklistDesynced(product)).toBe(false)
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

    it('every checklist mutation emits factoryUpdated', () => {
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

      expect(emitted).toEqual(Array(6).fill('factoryUpdated'))
    })

    it('unticking dirties the plan too, not only ticking', () => {
      const factory = newFactory('Provider', 0, 1)
      factory.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200 })

      toggleChecklistInput(factory, factory.inputs[0])
      emitted = []
      toggleChecklistInput(factory, factory.inputs[0])

      expect(factory.inputs[0].completed).toBe(false)
      expect(emitted).toEqual(['factoryUpdated'])
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

      toggleChecklistProduct(provider, provider.products[0])
      toggleChecklistProduct(provider, provider.products[0])

      expect(checklistSummaryState(provider)).toBe('complete')
    })
  })
})
