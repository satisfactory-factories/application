// noinspection DuplicatedCode - Duplicated by the backend
import { PowerItem } from '@/interfaces/Recipes'

export interface PartMetrics {
  amountRequired: number; // Total amount required by all products on the line
  amountRequiredProduction: number; // Total amount required by production
  amountRequiredExports: number; // Total amount required by all exports
  amountRequiredPower: number;
  amountSupplied: number; // Total amount of surplus used for display purposes
  amountSuppliedViaInput: number; // This is the amount supplied by the inputs
  amountSuppliedViaProduction: number; // This is the amount supplied by internal products
  amountRemaining: number; // This is the amount remaining after all inputs and internal products are accounted for. Can be a minus number, which is used for surplus calculations.
  isRaw: boolean; // Whether the part is a raw resource or not, if so it will always be marked as satisfied.
  satisfied: boolean; // Use of use flag for templating.
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

export interface FactoryItem {
  id: string;
  recipe: string;
  amount: number;
  displayOrder: number;
  requirements: { [key: string]: { amount: number } };
  buildingRequirements: BuildingRequirement
  byProducts?: ByProductItem[];
}

export interface FactoryExportItem {
  productId: string;
  surplus: number;
  demands: number;
  supply: number;
  displayOrder: number;
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

export interface FactoryInternalProduct {
  id: string;
  amount: number
}

export interface FactorySyncState {
  amount: number
  recipe: string
}

export interface FactoryTask {
  title: string
  completed: boolean
}

export interface FactoryPowerProducer {
  building: string;
  buildingAmount: number;
  ingredients: PowerItem[],
  ingredientAmount: number; // Enables the user to specify the quantity of fuel to use.
  byproduct: { part: string, amount: number } | null; // E.g. uranium waste, which is added as a product back into the factory.parts to be dealt with via export or re-use.
  powerAmount: number; // Amount of energy user is requesting to be generated.
  powerProduced: number; // Amount of energy actually produced calculated from requested ingredientAmount and powerAmount.
  recipe: string;
  buildingCount: number;
  displayOrder: number;
  updated: string | null; // Denotes what was just updated so we can recalculate the power generation based off ingredientAmount or powerAmount.
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
  products: FactoryItem[];
  byProducts: ByProductItem[];
  internalProducts: { [key: string]: FactoryInternalProduct };
  powerProducers: FactoryPowerProducer[];
  parts: { [key: string]: PartMetrics };
  buildingRequirements: { [key: string]: BuildingRequirement };
  requirementsSatisfied: boolean;
  exports: { [key: string]: FactoryExportItem };
  exportCalculator: { [key: string]: ExportCalculatorSettings };
  dependencies: FactoryDependency;
  rawResources: { [key: string]: WorldRawResource };
  power: FactoryPower;
  usingRawResourcesOnly: boolean;
  hidden: boolean; // Whether to hide the card or not
  hasProblem: boolean
  inSync: boolean | null;
  syncState: { [key: string]: FactorySyncState };
  displayOrder: number;
  tasks: FactoryTask[]
  notes: string
}

export interface FactoryTab {
  id: string;
  name: string;
  factories: Factory[];
}
