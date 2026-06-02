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

describe('Component: BuildingGroup', () => {
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

      updateBuildingGroup(buildingGroup)

      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: 'Building count must be a positive number.',
        type: 'warning',
      })
      expect(buildingGroup.buildingCount).toBe(1)
    })

    it('should emit a warning toast if the overclock percent is invalid', () => {
      buildingGroup.overclockPercent = -100

      updateBuildingGroup(buildingGroup)

      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: 'Overclock percentage must be a positive number.',
        type: 'warning',
      })
      expect(buildingGroup.overclockPercent).toBe(1)

      buildingGroup.overclockPercent = -100

      updateBuildingGroup(buildingGroup)
      expect(buildingGroup.overclockPercent).toBe(1)
    })

    it('should emit a warning toast if the overclock percent is above 250%', () => {
      buildingGroup.overclockPercent = 251

      updateBuildingGroup(buildingGroup)

      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: 'Overclock percentage must not exceed 250%.',
        type: 'warning',
      })
      expect(buildingGroup.overclockPercent).toBe(250)
    })

    it('should emit a warning toast if the overclock percent is above maximum precision', () => {
      buildingGroup.overclockPercent = 123.333333333

      updateBuildingGroup(buildingGroup)

      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: 'The game does not allow you to provide more than 4 decimal places for clocks.',
        type: 'warning',
      })
      expect(buildingGroup.overclockPercent).toBe(123.3333)
    })
  })
})
