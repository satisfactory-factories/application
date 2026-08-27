// The canonical plan shapes moved to the shared `common` package so the API validates
// exactly what the planner produces. Re-exported here so every existing
// `@/interfaces/planner/FactoryInterface` import keeps working.
export { FactoryPowerChangeType, ItemType } from 'common'

export type {
  BuildingGroup,
  BuildingRequirement,
  ByProductItem,
  ExportCalculatorFactorySettings,
  ExportCalculatorSettings,
  ExportCalculatorTransportGroup,
  Factory,
  FactoryDependency,
  FactoryDependencyMetrics,
  FactoryDependencyRequest,
  FactoryGroup,
  FactoryInput,
  FactoryItem,
  FactoryPower,
  FactoryPowerProducer,
  FactoryPowerSyncState,
  FactorySyncState,
  FactoryTab,
  FactoryTask,
  PartMetrics,
  WorldRawResource,
} from 'common'
