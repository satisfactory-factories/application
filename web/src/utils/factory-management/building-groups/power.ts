import { Factory, FactoryPowerProducer, ItemType } from '@/interfaces/planner/FactoryInterface'
import {
  calculateBuildingGroupParts,
  createBuildingGroup,
  rebalanceBuildingGroups,
} from '@/utils/factory-management/building-groups/common'

export const addPowerProducerBuildingGroup = (
  producer: FactoryPowerProducer,
  factory: Factory,
  addBuildings = true,
) => {
  createBuildingGroup(producer, ItemType.Power, addBuildings)

  // There's a high probability that a fractional building count has been created, so we need to run the balancing to make it whole buildings and underclocked.
  // Only do this though if we have one building group, as we don't want to mess with the overclocking if we have multiple groups.
  if (addBuildings) {
    rebalanceBuildingGroups(producer, ItemType.Power, factory)
  }
  calculateBuildingGroupParts([producer], ItemType.Power, factory)
}
