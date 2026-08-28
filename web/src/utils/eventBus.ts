import mitt from 'mitt'
import type { VersionMismatchBody } from 'common'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import type { TabField } from '@/sync/room-state'

type Events = {
  factoryUpdated: Factory;
  // The factory the user acted on, as opposed to the ones a recalculation
  // rippled into. Sync treats this as intent and factoryUpdated as payload.
  factoryEdited: Factory;
  // The same statement for a field the tab owns rather than a factory, so a
  // power target or a group list edited on its own still saves and still syncs.
  tabEdited: TabField;
  loggedIn: undefined;
  sessionExpired: undefined;
  // The version gate fired: an HTTP 426, or a socket closed 4426. `body` is only
  // present on the REST side, where the server states what it wanted.
  versionMismatch: { source: 'rest' | 'ws', body?: VersionMismatchBody };
  toast: { message: string; type?: 'info' | 'success' | 'warning' | 'error', timeout?: number };
  // Initial factory loading dialog
  loadingCompleted: undefined;
  incrementLoad: { step: string }; // Payload to denote loading or calculation step
  prepareForLoad: { count: number, shown: number };
  // Custom loading screen
  loaderInit: { title?: string, steps: number }
  loaderNextStep: { message: string, step?: number, isFinalStep?: boolean }
  // World data
  worldDataShow: boolean
  worldData: { buildings: any[] }

  readyForData: undefined;
  plannerShow: boolean;
  calculationsCompleted: undefined

  // Intro
  introToggle: boolean;
  splashShow: undefined;

  navigationReady: undefined;

  // Building Groups
  openBuildingGroupTutorial: undefined;
  toggleSidebar: undefined;
  sidebarChanged: boolean;
  openSummaryFullscreen: undefined;
  // Sidebar jump-links: unhide the target section (by element id) before scrolling to it.
  openSection: string;
}

const eventBus = mitt<Events>()

const originalEmit = eventBus.emit
eventBus.emit = <K extends keyof Events>(type: K, event?: Events[K]) => {
  console.log(`eventBus: Event emitted: ${type}`, event)
  originalEmit(type, event as Events[K])
}

export default eventBus
