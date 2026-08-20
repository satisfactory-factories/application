import { describe, expect, it } from 'vitest'
import { FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { updateDependency } from '@/utils/factory-management/dependencies'
import { setSyncState } from '@/utils/factory-management/syncState'
import { mockPowerProducer } from '@/utils/factory-management/status-fixtures'
import {
  checklistExportKey,
  countChecklistCompleted,
  countChecklistTotal,
  isChecklistComplete,
  isChecklistExportComplete,
  isChecklistExportDesynced,
  isInputChecklistDesynced,
  isPowerProducerChecklistDesynced,
  isProductChecklistDesynced,
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
      const product: FactoryItem = { id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true }

      // Never checked: not desynced, whatever the amount does.
      expect(isProductChecklistDesynced(product)).toBe(false)

      toggleChecklistProduct(product)
      expect(product.completed).toBe(true)
      expect(isProductChecklistDesynced(product)).toBe(false)

      product.amount = 99
      expect(isProductChecklistDesynced(product)).toBe(true)

      // Unchecking hides the flag (nothing checked, nothing to desync) without touching the baseline.
      toggleChecklistProduct(product)
      expect(isProductChecklistDesynced(product)).toBe(false)

      // Re-checking re-baselines against the new amount — the "check and uncheck to acknowledge" path.
      toggleChecklistProduct(product)
      expect(isProductChecklistDesynced(product)).toBe(false)
    })

    it('toggleChecklistInput and toggleChecklistPowerProducer follow the same rule', () => {
      const input = { factoryId: 99, outputPart: 'IronIngot', amount: 400 }
      toggleChecklistInput(input)
      expect(isInputChecklistDesynced(input)).toBe(false)
      input.amount = 399
      expect(isInputChecklistDesynced(input)).toBe(true)

      const producer = mockPowerProducer('generatorcoal', { buildingAmount: 4 })
      toggleChecklistPowerProducer(producer)
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

      toggleChecklistProduct(provider.products[0])
      toggleChecklistInput(provider.inputs[0])
      toggleChecklistPowerProducer(provider.powerProducers[0])
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
})
