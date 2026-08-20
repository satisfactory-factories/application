import { describe, expect, it } from 'vitest'
import { newFactory } from '@/utils/factory-management/factory'
import { updateDependency } from '@/utils/factory-management/dependencies'
import {
  checklistExportKey,
  countChecklistCompleted,
  countChecklistTotal,
  isChecklistExportComplete,
  toggleChecklistExport,
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

      toggleChecklistExport(factory, 2, 'IronPlate')
      expect(isChecklistExportComplete(factory, 2, 'IronPlate')).toBe(true)
      // A different requesting factory or part is a different item entirely.
      expect(isChecklistExportComplete(factory, 3, 'IronPlate')).toBe(false)
      expect(isChecklistExportComplete(factory, 2, 'IronRod')).toBe(false)

      toggleChecklistExport(factory, 2, 'IronPlate')
      expect(isChecklistExportComplete(factory, 2, 'IronPlate')).toBe(false)
    })
  })

  describe('countChecklistTotal / countChecklistCompleted', () => {
    it('counts one item per product, input and export request, and only completed ones as done', () => {
      const provider = newFactory('Provider', 0, 1)
      const consumer = newFactory('Consumer', 1, 2)

      provider.products.push(
        { id: 'IronPlate', recipe: 'IronPlate', amount: 100, displayOrder: 0, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true, completed: true },
        { id: 'IronRod', recipe: 'IronRod', amount: 50, displayOrder: 1, requirements: {}, buildingRequirements: { name: 'assemblermk1', amount: 1 }, buildingGroups: [], buildingGroupsTrayOpen: false, buildingGroupsHaveProblem: false, buildingGroupItemSync: true, completed: false }
      )
      provider.inputs.push({ factoryId: 99, outputPart: 'IronIngot', amount: 200, completed: true })

      // Two exports from provider to consumer.
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronPlate', amount: 60, completed: false })
      updateDependency(consumer, provider, { factoryId: consumer.id, outputPart: 'IronRod', amount: 20, completed: false })

      expect(countChecklistTotal(provider)).toBe(5) // 2 products + 1 input + 2 export requests

      toggleChecklistExport(provider, consumer.id, 'IronPlate')

      expect(countChecklistCompleted(provider)).toBe(3) // IronPlate product + IronIngot input + IronPlate export
    })
  })
})
