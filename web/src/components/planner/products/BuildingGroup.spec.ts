import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import eventBus from '@/utils/eventBus'
import { BuildingGroup, Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { addProductToFactory } from '@/utils/factory-management/products'
import { newFactory } from '@/utils/factory-management/factory'
import { updateBuildingGroup } from '@/components/planner/products/BuildingGroup'

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    emit: vi.fn(),
  },
}))

describe('BuildingGroup.ts', () => {
  let mockFactory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup

  beforeEach(() => {
    setActivePinia(createPinia())

    mockFactory = newFactory('Testing building groups')

    addProductToFactory(mockFactory, {
      id: 'IronIngot',
      amount: 30,
      recipe: 'IngotIron',
    })
    product = mockFactory.products[0]
    buildingGroup = product.buildingGroups[0]
    vi.spyOn(eventBus, 'emit')
  })

  describe('updateBuildingGroup', () => {
    it('should emit a warning toast if the building count is not a positive number', () => {
      buildingGroup.buildingCount = 0

      updateBuildingGroup(buildingGroup, product)

      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: 'Building count must be a positive number.',
        type: 'warning',
      })
    })

    it('should increase the product\'s quantity if it is a singular building group', () => {
      buildingGroup.buildingCount = 5

      updateBuildingGroup(buildingGroup, product)

      expect(product.buildingRequirements.amount).toBe(5)
      expect(product.amount).toBe(150)
    })
  })
})
