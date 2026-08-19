import { Factory, FactoryPowerProducer, ItemType } from '@/interfaces/planner/FactoryInterface'
import {
  calculateBuildingGroupParts,
  createBuildingGroup,
  syncBuildingGroups,
} from '@/utils/factory-management/building-groups/common'
import { isAlwaysSyncedBuilding } from '@/utils/factory-management/common'

export const addPowerProducerBuildingGroup = (
  producer: FactoryPowerProducer,
  factory: Factory,
  addBuildings = true,
) => {
  createBuildingGroup(producer, ItemType.Power, addBuildings)

  // There's a high probability that a fractional building count has been created, so we need to run the balancing to make it whole buildings and underclocked.
  // Only do this though if we have one building group, as we don't want to mess with the overclocking if we have multiple groups.
  // Fuel-less generators are always synced to the producer, so a new group is a re-split of
  // the buildings already there rather than an extra one for the user to balance away: their
  // balancing actions are hidden (no clocks to trim with), so an unsynced group would land
  // as a "Building Groups have a problem!" nothing on screen could resolve.
  if (addBuildings || isAlwaysSyncedBuilding(producer.building)) {
    syncBuildingGroups(producer, ItemType.Power, factory)
  }
  calculateBuildingGroupParts([producer], ItemType.Power, factory)
}
