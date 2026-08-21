// noinspection DuplicatedCode
// Duplicated by web
import { PowerItem } from './Recipes'

export interface PartMetrics {
  amountRequired: number; // Total amount required by all products on the line
  amountRequiredProduction: number; // Total amount required by production
  amountRequiredExports: number; // Total amount required by all exports
  amountRequiredPower: number;
  amountRequiredBuildings: number;
  amountSupplied: number; // Total amount of surplus used for display purposes
  amountSuppliedViaInput: number; // This is the amount supplied by the inputs
  amountSuppliedViaRaw: number; // This is the amount supplied by the raw resources assumed to be handled by the user.
  amountSuppliedViaProduction: number; // This is the amount supplied by internal products
  amountRemaining: number; // This is the amount remaining after all inputs and internal products are accounted for. Can be a minus number, which is used for surplus calculations.
  isRaw: boolean; // Whether the part is a raw resource or not, if so it will always be marked as satisfied.
  satisfied: boolean; // Use of use flag for templating.
  exportable: boolean // Whether the product should be a candidate for imports.
}

export interface BuildingRequirement {
  name: string;
  amount: number;
  powerConsumed?: number;
  powerProduced?: number;
}

// The material cost report behind Power & Buildings' "Material Costs" panel (#477), for one part.
export interface BuildingMaterialCost {
  amount: number;
  buildings: { [building: string]: number };
}

export interface ByProductItem {
  id: string;
  amount: number;
  byProductOf: string; // Product ID
}

export interface ProductBuildingGroup {
  id: number;
  buildingCount: number
  overclockPercent: number
  somersloops: number
}

export interface FactoryItem {
  id: string;
  recipe: string;
  amount: number;
  displayOrder: number;
  requirements: { [key: string]: { amount: number } };
  buildingRequirements: BuildingRequirement
  byProducts?: ByProductItem[];
  buildingGroups: ProductBuildingGroup[]
  buildingGroupTrayOpen: boolean
}

export interface FactoryDependencyRequest {
  requestingFactoryId: number;
  part: string;
  amount: number;
}

export interface FactoryDependencyMetrics {
  part: string;
  request: number;
  supply: number;
  isRequestSatisfied: boolean;
  difference: number;
}

export interface ExportCalculatorFactorySettings {
  trainTime: number;
  droneTime: number;
  truckTime: number;
  tractorTime: number;
}

export interface ExportCalculatorSettings {
  selected: string | null;
  factorySettings: {
    [key: string] : ExportCalculatorFactorySettings
  }
}

export interface FactoryDependency {
  requests: { [key: string]: FactoryDependencyRequest[] },
  metrics: { [key: string]: FactoryDependencyMetrics },
}

export interface WorldRawResource {
  id: string;
  name: string;
  amount: number;
}

export interface FactoryInput {
  factoryId: number | null;
  outputPart: string | null;
  amount: number
}

export interface FactorySyncState {
  amount: number
  recipe: string
}

export interface FactoryPowerSyncState {
  buildingAmount: number
  powerAmount: number
  recipe: string // And also the fuel used
  ingredientAmount: number
}

// What a factory's custom buildings looked like when it was marked as built in-game.
export interface FactoryCustomBuildingSyncState {
  building: string
  amount: number
  ingredientAmount: number
}

export interface FactoryTask {
  title: string
  completed: boolean
}

export interface FactoryPowerProducer {
  building: string;
  buildingAmount: number; // Amount of buildings requested by the user
  buildingCount: number; // Amount of buildings actually needed to produce the power requested by the user
  ingredients: PowerItem[],
  ingredientAmount: number; // Enables the user to specify the quantity of fuel to use.
  byproduct: { part: string, amount: number } | null; // E.g. uranium waste, which is added as a product back into the factory.parts to be dealt with via export or re-use.
  powerAmount: number; // Amount of energy user is requesting to be generated.
  powerProduced: number; // Amount of energy actually produced calculated from requested ingredientAmount and powerAmount.
  recipe: string;
  displayOrder: number;
  updated: string | null; // Denotes what was just updated so we can recalculate the power generation based off ingredientAmount or powerAmount.
}

// A building the user placed that makes nothing: a portal, a train station, a radar tower. It
// costs power, and a few of them cost parts to keep running.
export interface FactoryCustomBuilding {
  id: string;
  building: string;
  amount: number;
  ingredients: { part: string, perMin: number }[];
  powerConsumed: number;
  displayOrder: number;
}

export interface FactoryPower {
  consumed: number;
  produced: number;
  difference: number;
}

// Denormalised onto every member factory, because the save payload is a bare Factory[]
export interface FactoryGroup {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface Factory {
  id: number;
  name: string;
  inputs: FactoryInput[];
  previousInputs: FactoryInput[] // Since we can't use the previous state in the store, we need to store it here then update it.
  products: FactoryItem[];
  byProducts: ByProductItem[];
  powerProducers: FactoryPowerProducer[];
  customBuildings: FactoryCustomBuilding[];
  parts: { [key: string]: PartMetrics };
  buildingRequirements: { [key: string]: BuildingRequirement };
  buildingMaterialCosts: { [key: string]: BuildingMaterialCost };
  requirementsSatisfied: boolean;
  exportCalculator: { [key: string]: ExportCalculatorSettings };
  dependencies: FactoryDependency;
  rawResources: { [key: string]: WorldRawResource };
  power: FactoryPower;
  usingRawResourcesOnly: boolean;
  hidden: boolean; // Whether to hide the card or not
  hasProblem: boolean
  inSync: boolean | null;
  syncState: { [key: string]: FactorySyncState };
  syncStatePower: { [key: string]: FactoryPowerSyncState };
  syncStateCustomBuildings: { [key: string]: FactoryCustomBuildingSyncState };
  displayOrder: number;
  tasks: FactoryTask[]
  notes: string
  icon?: string // ID from the frontend's factory-icons registry
  group?: FactoryGroup // Absent means ungrouped
  dataVersion: string
}

export interface FactoryTab {
  id: string;
  name: string;
  factories: Factory[];
  groups?: FactoryGroup[]; // Registry for groups with no member factory to carry them
  // Marks the plan as answered for the raw-resources change; absent means built before v0.6
  plannerVersion?: string;
}
