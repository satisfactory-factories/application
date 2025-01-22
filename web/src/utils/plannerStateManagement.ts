import { Factory, FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { PlannerState, PlannerUserOptions } from '@/interfaces/planner/PlannerState'

interface PlannerStateOptions {
  user?: string,
  currentTabId?: string;
  userOptions?: PlannerUserOptions
  tabs?: { [key: string ]: FactoryTab },
}

export const newState = (options: PlannerStateOptions): PlannerState => {
  const newTabData = newTab({
    displayOrder: 0,
  })
  const defaultUserOptions: PlannerUserOptions = {
    satisfactionBreakdowns: false,
  }
  return {
    user: options.user ?? null,
    currentTabId: options.currentTabId ?? newTabData.id,
    lastSaved: null,
    userOptions: options.userOptions ?? defaultUserOptions,
    tabs: options.tabs ?? { [newTabData.id]: newTabData },
  }
}

interface FactoryTabOptions {
  id?: string
  name?: string
  factories?: Factory[]
  displayOrder?: number
}

export const newTab = (options?: FactoryTabOptions): FactoryTab => {
  return {
    id: options?.id ?? crypto.randomUUID(),
    name: options?.name ?? 'Default',
    // Fill the tabs from the legacy factories array if present so no data gets lost
    factories: options?.factories ?? [],
    displayOrder: options?.displayOrder ?? 0,
  }
}

export const addTab = (state: PlannerState, tab: FactoryTab): void => {
  tab.displayOrder = getTabsCount(state)
  state.tabs[tab.id] = tab
}

export const getCurrentTab = (state: PlannerState): FactoryTab => {
  return getTab(state, state.currentTabId)
}

export const getTab = (state: PlannerState, tabId: string): FactoryTab => {
  const tab = state.tabs[tabId]

  if (!tab) {
    throw new Error(`Tab with id ${tabId} not found`)
  }
  return tab
}

export const deleteTab = (state: PlannerState, tab: FactoryTab): void => {
  if (state.tabs[tab.id]) {
    delete state.tabs[tab.id]
  }
  regenerateTabOrders(state)

  // Reset the current tab ID to be the last tab ID
  const lastTabIndex = Object.keys(state.tabs).length - 1
  state.currentTabId = Object.values(state.tabs)[lastTabIndex].id
}

export const getTabsCount = (state: PlannerState): number => {
  return Object.keys(state.tabs).length
}

export const getTabAtIndex = (state: PlannerState, index: number): FactoryTab => {
  const key = Object.keys(state.tabs)[index]
  return state.tabs[key]
}

export const regenerateTabOrders = (state: PlannerState): void => {
  // Regenerate display orders
  const tabVals = Object.values(state.tabs)

  // Sort the tabs by display order
  tabVals.sort((a, b) => a.displayOrder - b.displayOrder)

  // Reassign the display order
  tabVals.forEach((tab, index) => {
    tab.displayOrder = index
  })
}

export const migrateFactoryTabsToState = (oldState: FactoryTab[]): PlannerState => {
  const oldActiveTab = oldState[0] // We're going to assume it's the first one.

  const newTabs: { [key: string]: FactoryTab } = {}
  oldState.forEach((oldTab, index) => {
    newTabs[oldTab.id] = {
      id: oldTab.id,
      name: oldTab.name,
      factories: oldTab.factories,
      displayOrder: index,
    }
  })

  const state = newState({
    currentTabId: oldActiveTab.id,
    tabs: newTabs,
  })

  // Generate the tab display order
  Object.keys(state.tabs).forEach((tabId, index) => {
    state.tabs[tabId].displayOrder = index
  })

  return state
}
