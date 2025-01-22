import { FactoryTab } from '@/interfaces/planner/FactoryInterface'

export interface PlannerUserOptions {
  satisfactionBreakdowns: boolean
}

export interface PlannerState {
  user: string | null;
  currentTabId: string;
  lastSaved: Date | null;
  userOptions: PlannerUserOptions;
  tabs: { [ key: string ]: FactoryTab };
}
