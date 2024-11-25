import { Factory } from '@/interfaces/planner/FactoryInterface'

export interface BackendFactoryDataResponse {
  user: string;
  data: Factory[];
  lastSaved: Date
}
