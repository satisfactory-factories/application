import { FactoryPowerProducer, GroupType } from '@/interfaces/planner/FactoryInterface'
import { addBuildingGroup } from '@/utils/factory-management/building-groups/common'

export const addPowerProducerBuildingGroup = (producer: FactoryPowerProducer, addBuildings = true) => {
  addBuildingGroup(producer, GroupType.Power, addBuildings)

  // TODO
  // There's a high probability that a fractional building count has been created, so we need to run the balancing to make it whole buildings and underclocked.
  // Only do this though if we have one building group, as we don't want to mess with the overclocking if we have multiple groups.
  if (producer.buildingGroups.length === 1) {
    rebalancePowerProducerBuildingGroups(producer)
  }
  calculatePowerProducerBuildingGroupParts(producer)
}

export const rebalancePowerProducerBuildingGroups = (producer: FactoryPowerProducer) => {

}

export const calculatePowerProducerBuildingGroupParts = (producer: FactoryPowerProducer) => {

}
