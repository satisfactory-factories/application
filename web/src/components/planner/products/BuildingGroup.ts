import eventBus from '@/utils/eventBus'
import {
  BuildingGroup,
} from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'

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
