// Minimal product / power-producer literals for the status and problems specs. Deliberately not
// built through addProductToFactory: these specs test detection over a factory's shape, and going
// through the engine would drag game data in for no benefit.
import { FactoryItem, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'

export const mockProduct = (id: string, overrides: Partial<FactoryItem> = {}): FactoryItem => ({
  id,
  recipe: id,
  amount: 100,
  displayOrder: 0,
  requirements: {},
  buildingRequirements: { name: 'smeltermk1', amount: 1 },
  buildingGroups: [],
  buildingGroupsTrayOpen: false,
  buildingGroupsHaveProblem: false,
  buildingGroupItemSync: true,
  completed: false,
  ...overrides,
})

export const mockPowerProducer = (
  building: string,
  overrides: Partial<FactoryPowerProducer> = {},
): FactoryPowerProducer => ({
  id: '1234',
  building,
  buildingAmount: 1,
  buildingCount: 1,
  ingredients: [],
  fuelAmount: 0,
  byproduct: null,
  powerAmount: 100,
  powerProduced: 100,
  recipe: building,
  displayOrder: 0,
  updated: null,
  buildingGroups: [],
  buildingGroupsTrayOpen: false,
  buildingGroupsHaveProblem: false,
  buildingGroupItemSync: true,
  completed: false,
  ...overrides,
})
