// noinspection DuplicatedCode
// Duplicated by backend
import { NodePurity, PowerItem } from '@/interfaces/Recipes'

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
  // Nothing in the game consumes this part: it is the end of its chain. Derived from the game
  // data every calculation, like isRaw. Optional so a part built before the metrics are stamped
  // (or by an old test fixture) reads as false rather than undefined-y.
  isEndProduct?: boolean;
  // Whether the AWESOME Sink would take this part. Decides how serious an unwanted byproduct is:
  // a sinkable one has a way out, a fluid or radioactive one does not. Derived like isEndProduct.
  isSinkable?: boolean;
  // What the AWESOME Sinks placed on this part take: everything left once production, power and
  // exports have had their share. Zero unless the user placed a sink, and always zero for a part
  // the sink will not accept. Derived every calculation, so optional for plans saved before it.
  amountRequiredSink?: number;
  // The surplus this part would carry if it were not being sunk. Kept so the satisfaction row can
  // show the number sinking removed rather than silently reporting zero.
  amountRemainingPreSink?: number;
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
  // Extraction groups only: which extractor sits on the nodes and how pure they are. Both are
  // per group because one ore line routinely mixes marks and purities. Absent on every other
  // group type; defaults are applied when missing.
  extractorBuilding?: string
  purity?: NodePurity
  // Resource well groups only: how many satellite extractors sit on each purity of micro-node.
  // The well's output is their sum; the group's clock is the pressurizer's and scales them all.
  satellites?: { [purity in NodePurity]: number }
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
  // Which building this producer was when it was marked in sync. Needed because the state is keyed
  // by the producer's id rather than its building, so swapping the building in place keeps the same
  // key and would otherwise go unnoticed. Optional: plans marked in sync before the key changed
  // have no record of it, and an absent value must not read as a change.
  building?: string
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

/**
 * A folder a factory belongs to. Denormalised: the whole record is carried by every member
 * factory rather than referenced by id from the tab.
 *
 * That looks redundant and is deliberate. Cloud sync uploads a bare Factory[] (sync-actions.ts),
 * addTab() rebuilds a tab from four named fields, and templates and crash recovery all move
 * factories rather than tabs — a group held only on the tab would be dropped by every one of
 * them, stranding factories that still claimed membership. Riding on the factory means every
 * path that already carries a plan carries its groups, with no transport changes at all.
 *
 * FactoryTab.groups is a registry for the one case a factory cannot carry: a group with no
 * members yet. See reconcileGroups() in utils/factory-management/factory-groups.ts.
 */
export interface FactoryGroup {
  id: string;
  name: string;
  color: string; // Hex, from groupPalette or a custom pick
  order: number; // Position of the group within the plan
  // No `collapsed` here on purpose: it is view state, held by useGroupCollapse. Fanning it out to
  // every member on each toggle cost a save and a recalculation per factory.
}

/**
 * What the user has told the planner to do with a part's surplus.
 *
 * The two are one axis with very different consequences, which is why they sit in one record. A
 * sink is disposal: the surplus is gone, and the ledger says so. A depot is storage: finite, so it
 * defers a backlog rather than preventing one, and it changes no number at all.
 */
export interface FactoryPartDisposal {
  // AWESOME Sink buildings on this part. Any positive number sinks the WHOLE surplus — the sink
  // takes whatever the belt brings it, so the count says what to build and what it draws, not how
  // much it will accept.
  sinks: number;
  // Dimensional Depot Uploaders on this part. One Mercer Sphere each.
  depots: number;
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
  // Per-part disposal — the sinks and depot uploaders placed on each part's surplus. Its own map
  // rather than a field on PartMetrics because parts.ts wipes and rebuilds factory.parts on every
  // calculation. Sticky by design: a flag is never pruned when its part leaves the factory, so
  // read-time filtering makes a stale key inert and bringing the part back restores the intent.
  // Optional so plans saved before it load untouched; newFactory and initFactories set `{}`.
  partDisposal?: { [partId: string]: FactoryPartDisposal };
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
  // ID from src/data/factory-icons.json. Absent (old plans, or "use default") shows the
  // generic industry glyph. Deliberately a bare ID: plans in localStorage, Mongo and share
  // links cannot be migrated, so nothing about how it is drawn belongs in the stored value.
  icon?: string
  // The group this factory belongs to. Absent means Ungrouped. Source of truth — see
  // FactoryGroup above for why the whole record lives here rather than an id.
  group?: FactoryGroup
  dataVersion: string
}

export interface FactoryTab {
  id: string;
  name: string;
  factories: Factory[];
  // The user's arbitrary grid generation target (MW) for this plan. Optional so
  // older saved tabs load cleanly; defaults to 0 when absent.
  powerTarget?: number;
  // Registry for groups that currently have no member factory to carry them. Everything else
  // is derived from the factories themselves; reconcileGroups() keeps the two in step.
  groups?: FactoryGroup[];
  // The planner version this plan has been reconciled with.
  //
  // It records that the user has ANSWERED for this plan, not that the plan is correct: it is
  // stamped both when the Raw Resources Wizard fixes a plan and when the user dismisses the
  // notice saying they will sort it themselves. Absent means the plan was built before v0.6,
  // when raw resources were still assumed. Do not read it as "this plan's raw supply is met" —
  // ask collectRawWizardRows() for that.
  plannerVersion?: string;
}

// Fields saved plans still carry from before raw supply stopped being assumable. Typed only so
// the load path can strip them; nothing reads them.
export interface LegacyRawAssumptionFields {
  assumeRawInputs?: boolean | null;
}
