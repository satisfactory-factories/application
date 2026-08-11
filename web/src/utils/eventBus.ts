import mitt from 'mitt'
import { Factory } from '@/interfaces/planner/FactoryInterface'

type Events = {
  factoryUpdated: Factory;
  loggedIn: undefined;
  sessionExpired: undefined;
  dataSynced: undefined;
  dataOutOfSync: undefined;
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
  // Fired when the introduction closes, so the splash can stop waiting for it. `introToggle` is
  // the inbound request to open or close it, which is not the same thing.
  introDismissed: undefined;
  splashShow: undefined;
  // The previous release's splash, kept for anyone who missed it. Only ever opened by hand.
  splashShowV5: undefined;
  // The Raw Resources Wizard lives inside OptionsDialog; this is how anything else asks for it.
  openRawWizard: undefined;

  navigationReady: undefined;

  // Building Groups
  openBuildingGroupTutorial: undefined;
  buildingGroupUpdated: Factory;
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
