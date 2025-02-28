import eventBus from '@/utils/eventBus'
import {
  BuildingGroup,
  FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer,
  GroupType,
} from '@/interfaces/planner/FactoryInterface'
import { increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
import { fetchGameData } from '@/utils/gameDataService'

const gameData = await fetchGameData()

export const updateBuildingGroup = (
  group: BuildingGroup,
  item: FactoryItem | FactoryPowerProducer
) => {
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

  if (item.buildingGroups.length === 1) {
    // Since we have edited the buildings in the group, we now need to edit the product's building requirements.
    if (group.type === GroupType.Product) {
      const subject = item as FactoryItem
      subject.buildingRequirements.amount = group.buildingCount
      increaseProductQtyViaBuilding(subject, gameData)
    } else if (group.type === GroupType.Power) {
      const subject = item as FactoryPowerProducer
      subject.buildingAmount = group.buildingCount
      subject.updated = FactoryPowerChangeType.Building

      // The factory update should then take over and change the rest
    } else {
      throw new Error('Invalid type')
    }
  }

  // If the user is trying to use more than .0001 precision for overclock, truncate it and alert them.
  const clock = group.overclockPercent.toString().split('.')[0]
  const precision = group.overclockPercent.toString().split('.')[1]
  if (precision?.length > 4) {
    // Truncate the overclock to 4 decimal places
    group.overclockPercent = Number(`${clock}.${precision.slice(0, 4)}`)
    eventBus.emit('toast', {
      message: 'The game does not allow you to provide more than 4 decimal places for clocks.',
      type: 'warning',
    })
  }
}
