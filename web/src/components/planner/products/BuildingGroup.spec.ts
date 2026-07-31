import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import eventBus from '@/utils/eventBus'
import { BuildingGroup, Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { addProductToFactory } from '@/utils/factory-management/products'
import { newFactory } from '@/utils/factory-management/factory'
import { applyGroupSomersloops, updateBuildingGroup } from '@/components/planner/products/BuildingGroup'

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
    vi.clearAllMocks()
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
        message: 'The game does not allow you to provide more than 4 decimal places for clocks. It has been truncated to 4 decimal places.',
        type: 'warning',
      })
      expect(buildingGroup.overclockPercent).toBe(123.3333)
    })
  })

  // Entered somersloops are clamped as they're typed. Vuetify only enforces `max` on blur
  // and keeps its own text, so an over-cap entry has to be caught here and the field
  // remounted (the boolean return); otherwise the planner appears to accept 5 sloops in a
  // 4-slot building while quietly calculating with 4.
  describe('applyGroupSomersloops', () => {
    const caps: [string, number][] = [
      ['smeltermk1', 1],
      ['constructormk1', 1],
      ['assemblermk1', 2],
      ['foundrymk1', 2],
      ['oilrefinery', 2],
      ['converter', 2],
      ['manufacturermk1', 4],
      ['blender', 4],
      ['hadroncollider', 4],
      ['quantumencoder', 4],
    ]

    it.each(caps)('should clamp an over-cap entry on %s to %i and warn', (building, slots) => {
      expect(applyGroupSomersloops(buildingGroup, building, slots + 1)).toBe(true)

      expect(buildingGroup.somersloops).toBe(slots)
      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: `This building only has ${slots} somersloop slot(s) per building.`,
        type: 'warning',
      })
    })

    it.each(caps)('should accept a full house of somersloops on %s', (building, slots) => {
      expect(applyGroupSomersloops(buildingGroup, building, slots)).toBe(false)

      expect(buildingGroup.somersloops).toBe(slots)
      expect(eventBus.emit).not.toHaveBeenCalled()
    })

    it('should clamp negative entries to 0 without warning about slots', () => {
      expect(applyGroupSomersloops(buildingGroup, 'assemblermk1', -2)).toBe(true)

      expect(buildingGroup.somersloops).toBe(0)
      expect(eventBus.emit).not.toHaveBeenCalled()
    })

    it('should round fractional entries to whole somersloops', () => {
      expect(applyGroupSomersloops(buildingGroup, 'manufacturermk1', 2.6)).toBe(true)
      expect(buildingGroup.somersloops).toBe(3)
    })

    it('should treat an empty field as 0', () => {
      buildingGroup.somersloops = 2
      expect(applyGroupSomersloops(buildingGroup, 'assemblermk1', null)).toBe(false)
      expect(buildingGroup.somersloops).toBe(0)
    })

    it('should zero the entry on a building that cannot be amplified', () => {
      expect(applyGroupSomersloops(buildingGroup, 'packager', 2)).toBe(true)
      expect(buildingGroup.somersloops).toBe(0)
    })

    it('should leave the entry alone while the building is still unresolved', () => {
      expect(applyGroupSomersloops(buildingGroup, '', 3)).toBe(false)
      expect(buildingGroup.somersloops).toBe(3)
    })
  })
})
