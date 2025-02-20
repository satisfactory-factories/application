// noinspection DuplicatedCode
// Duplicated by backend
import { PowerItem } from '@/interfaces/Recipes'

export interface PartMetrics {
  amountRequired: number; // Total amount required by all products on the line
  amountRequiredProduction: number; // Total amount required by production
  amountRequiredExports: number; // Total amount required by all exports
  amountRequiredPower: number;
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

export interface ByProductItem {
  id: string;
  amount: number;
  byProductOf: string; // Product ID
}

export enum GroupType {
  Power = 'Power',
  Product = 'Product',
}

export interface BuildingGroup {
  id: number;
  buildingCount: number
  overclockPercent: number
  parts: {[key: string]: number}
  powerUsage: number
  powerProduced: number
  somersloops?: number
  type: GroupType
}

export interface FactoryItem {
  id: string;
  recipe: string;
  amount: number;
  displayOrder: number;
  requirements: { [key: string]: { amount: number } };
  buildingRequirements: BuildingRequirement
  byProducts?: ByProductItem[];
  buildingGroups: BuildingGroup[]
  buildingGroupsTrayOpen: boolean
  buildingGroupsHaveProblem: boolean
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

export interface FactoryTask {
  title: string
  completed: boolean
}

export enum FactoryPowerChangeType {
  Building = 'building',
  Fuel = 'fuel',
  Ingredient = 'ingredient',
  Power = 'power',
}

export interface FactoryPowerProducer {
  id: string;
  building: string;
  buildingAmount: number; // Amount of buildings requested by the user
  buildingCount: number; // Amount of buildings actually needed to produce the power requested by the user
  ingredients: PowerItem[],
  fuelAmount: number; // Enables the user to specify the quantity of fuel to use.
  byproduct: { part: string, amount: number } | null; // E.g. uranium waste, which is added as a product back into the factory.parts to be dealt with via export or re-use.
  powerAmount: number; // Amount of energy user is requesting to be generated.
  powerProduced: number; // Amount of energy actually produced calculated from requested ingredientAmount and powerAmount.
  recipe: string;
  displayOrder: number;
  updated: FactoryPowerChangeType | null; // Denotes what was just updated so we can recalculate the power generation based off ingredientAmount or powerAmount.
  buildingGroups: BuildingGroup[]
  buildingGroupsTrayOpen: boolean
  buildingGroupsHaveProblem: boolean
}

export interface FactoryPower {
  consumed: number;
  produced: number;
  difference: number;
}

export interface Factory {
  id: number;
  name: string;
  inputs: FactoryInput[];
  previousInputs: FactoryInput[] // Since we can't use the previous state in the store, we need to store it here then update it.
  products: FactoryItem[];
  byProducts: ByProductItem[];
  powerProducers: FactoryPowerProducer[];
  parts: { [key: string]: PartMetrics };
  buildingRequirements: { [key: string]: BuildingRequirement };
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
  displayOrder: number;
  tasks: FactoryTask[]
  notes: string
  dataVersion: string
}

export interface FactoryTab {
  id: string;
  name: string;
  factories: Factory[];
}
