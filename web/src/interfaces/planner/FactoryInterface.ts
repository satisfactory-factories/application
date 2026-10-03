// The canonical plan shapes moved to the shared `common` package so the API validates
// exactly what the planner produces. Re-exported here so every existing
// `@/interfaces/planner/FactoryInterface` import keeps working.
export { FactoryPowerChangeType, ItemType } from 'common'

export type {
  BuildingGroup,
  BuildingMaterialCost,
  BuildingRequirement,
  ByProductItem,
  ExportCalculatorFactorySettings,
  ExportCalculatorSettings,
  ExportCalculatorTransportGroup,
  Factory,
  FactoryCustomBuilding,
  FactoryCustomBuildingSyncState,
  FactoryDependency,
  FactoryDependencyMetrics,
  FactoryDependencyRequest,
  FactoryGroup,
  FactoryInput,
  FactoryItem,
  FactoryPartDisposal,
  FactoryPower,
  FactoryPowerProducer,
  FactoryPowerSyncState,
  FactorySyncState,
  FactoryTab,
  FactoryTask,
  LegacyRawAssumptionFields,
  PartMetrics,
  WorldRawResource,
} from 'common'
