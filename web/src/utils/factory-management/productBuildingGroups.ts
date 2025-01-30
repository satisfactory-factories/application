import { FactoryItem, ProductBuildingGroup } from '@/interfaces/planner/FactoryInterface'

export const newBuildingGroup = (): ProductBuildingGroup => {
  return {
    id: Math.floor(Math.random() * 10000),
    buildingCount: 0,
    overclockPercent: 0,
    sommersloops: 0,
    notes: '',
  }
}

export const addGroup = (product: FactoryItem) => {
  product.buildingGroups.push(newBuildingGroup())
}
