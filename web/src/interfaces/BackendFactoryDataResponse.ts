import { Factory, FactoryTab } from '@/interfaces/planner/FactoryInterface'

export interface BackendFactoryDataResponse {
  user: string;
  // Clients up to v0.5 saved a bare Factory[]; from v0.6 the whole tab is saved, so plan-level
  // state survives a restore. Both shapes are in accounts right now and both must load.
  data: Factory[] | FactoryTab;
  lastSaved: Date
}
