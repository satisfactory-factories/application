import { Factory } from '@/interfaces/planner/FactoryInterface'

// Legacy whole-plan blob response from GET /load. Deprecated — the v2 tab sync uses
// BackendTabsResponse. Remove alongside the /load endpoint.
export interface BackendFactoryDataResponse {
  user: string;
  data: Factory[];
  lastSaved: Date
}

// One tab as returned by the /tabs endpoints. `data` is only present on the /tabs/full
// and /tabs/:tabId endpoints — the metadata listing omits it.
export interface BackendTabEntry {
  tabId: string;
  name: string;
  order: number;
  lastSaved: string;
  data?: Factory[];
}

export interface BackendTabsResponse {
  tabs: BackendTabEntry[];
  migrated: boolean;
}
