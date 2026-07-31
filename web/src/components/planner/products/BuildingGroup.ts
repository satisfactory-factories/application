import eventBus from '@/utils/eventBus'
import {
  BuildingGroup,
} from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'
import {
  getSomersloopSlots,
  isAmplifiableBuilding,
  sanitizeGroupSomersloops,
} from '@/utils/factory-management/building-groups/somersloops'

// Applies a typed somersloop value to the group, clamped to the building's slot count.
// Returns true when the entry was out of range, so the caller can force the field to
// re-render — Vuetify keeps its own text and would otherwise leave e.g. "9" on screen.
export const applyGroupSomersloops = (group: BuildingGroup, building: string, value: number | null): boolean => {
  const raw = Number(value)
  group.somersloops = Number.isFinite(raw) ? raw : 0

  const requested = group.somersloops
  sanitizeGroupSomersloops(group, building)

  if (group.somersloops === requested) {
    return false
  }

  if (isAmplifiableBuilding(building) && requested > getSomersloopSlots(building)) {
    eventBus.emit('toast', {
      message: `This building only has ${getSomersloopSlots(building)} somersloop slot(s) per building.`,
      type: 'warning',
    })
  }

  return true
}

export const updateBuildingGroup = (group: BuildingGroup) => {
  if (group.buildingCount === 0 || isNaN(group.buildingCount) || group.buildingCount === null) {
    eventBus.emit('toast', {
      message: 'Building count must be a positive number.',
      type: 'warning',
    })
    group.buildingCount = 1
    return
  }

  // Ensure the building count is a whole number
  if (group.buildingCount % 1 !== 0) {
    eventBus.emit('toast', {
      message: 'Building count must equal to a whole number. If you need a single building clocked, create a new building group and adjust it\'s clock.',
      type: 'error',
      timeout: 5000,
    })
    group.buildingCount = Math.floor(group.buildingCount)
  }

  const precision = group.overclockPercent.toString().split('.')[1]
  if (precision?.length > 4) {
    // Truncate the overclock to 4 decimal places
    group.overclockPercent = formatNumberFully(group.overclockPercent, 4)
    eventBus.emit('toast', {
      message: 'The game does not allow you to provide more than 4 decimal places for clocks. It has been truncated to 4 decimal places.',
      type: 'warning',
    })
  }

  if (group.overclockPercent <= 0) {
    eventBus.emit('toast', {
      message: 'Overclock percentage must be a positive number.',
      type: 'warning',
    })
    group.overclockPercent = 1
  }

  if (group.overclockPercent > 250) {
    eventBus.emit('toast', {
      message: 'Overclock percentage must not exceed 250%.',
      type: 'warning',
    })
    group.overclockPercent = 250
  }
}
