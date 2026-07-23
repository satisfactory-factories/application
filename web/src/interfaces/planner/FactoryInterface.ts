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

export enum ItemType {
  Power = 'Power',
  Product = 'Product'
}

export interface BuildingGroup {
  id: number;
  buildingCount: number
  overclockPercent: number
  // True when the user dialled the clock in themselves (vs the solver deriving it).
  // A user-set fractional clock is deliberate precision: quantities derived from it are
  // exact and must not be snapped to whole numbers. Optional so old saves default falsy.
  clockSetByUser?: boolean
  parts: { [key: string]: number }
  powerUsage: number
  // Variable-power buildings draw between min and max over the recipe cycle; powerUsage is
  // the average. Equal to powerUsage for fixed-power buildings.
  powerUsageMin?: number
  powerUsageMax?: number
  powerProduced: number
  // Variable-output generators (Geothermal) oscillate between min and max; powerProduced
  // is the average. Equal to powerProduced for steady generators.
  powerProducedMin?: number
  powerProducedMax?: number
  // Alien Power Augmenter groups only: whether this group's buildings are fed
  // Alien Power Matrixes (raises their circuit boost and creates fuel demand).
  supplyMatrixes?: boolean
  somersloops?: number
  type: ItemType
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
  buildingGroupItemSync: boolean
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

export interface ExportCalculatorTransportGroup {
  id: number;
  mark: number; // Conveyor belt mark (1-6) or pipeline mark (1-2)
  amount: number; // Items/min (belts) or m³/min (pipes) carried by this group
}

export interface ExportCalculatorFactorySettings {
  trainTime: number;
  droneTime: number;
  truckTime: number;
  tractorTime: number;
  // Optional: absent on old saves, initialized lazily by the belt/pipe calculator
  beltGroups?: ExportCalculatorTransportGroup[];
  pipeGroups?: ExportCalculatorTransportGroup[];
}

export interface ExportCalculatorSettings {
  selected: string | null;
  factorySettings: {
    [key: string]: ExportCalculatorFactorySettings
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
  Power = 'power'
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
  buildingGroupItemSync: boolean
}

export interface FactoryPower {
  consumed: number;
  // Trough/peak draw when variable-power buildings (Particle Accelerator etc.) swing to
  // their extremes. Equal to `consumed` when the factory has no variable-power buildings.
  consumedMin?: number;
  consumedMax?: number;
  produced: number;
  // Trough/peak output when variable generators (Geothermal) swing to their extremes.
  // Equal to `produced` when the factory has no variable generators.
  producedMin?: number;
  producedMax?: number;
  // Alien Power Augmenters in this factory: total circuit boost fraction they contribute
  // (0.4 = 40%) and the grid-wide MW that boost yields (fraction x total base generation
  // across ALL factories — the plan is assumed to be one power grid). The fueled/unfueled
  // building counts drive the "2 at 30%, 1 at 10%" breakdown displays.
  boostPercent?: number;
  boostMw?: number;
  boostFueledBuildings?: number;
  boostUnfueledBuildings?: number;
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
  // The user's arbitrary grid generation target (MW) for this plan. Optional so
  // older saved tabs load cleanly; defaults to 0 when absent.
  powerTarget?: number;
}
