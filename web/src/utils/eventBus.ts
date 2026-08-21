import mitt from 'mitt'
import { Factory } from '@/interfaces/planner/FactoryInterface'

type Events = {
  factoryUpdated: Factory;
  // Plan-level state changed (the planner version, and anything else held on the tab rather
  // than on a factory). Persistence and the cloud dirty flag both hang off factoryUpdated, so
  // without this a tab-level edit is saved by nothing.
  planUpdated: undefined;
  loggedIn: undefined;
  sessionExpired: undefined;
  dataSynced: undefined;
  dataOutOfSync: undefined;
  // The API has refused this build. Syncing stops and the user is asked to reload; local data
  // is never touched.
  clientOutdated: { minimumVersion: string };
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
  // Fired when the introduction closes. `introToggle` is the inbound request to open or close
  // it, which is not the same thing. Nothing acts on this today — the release splash used to,
  // and deliberately stopped, so that a first-time visitor is not handed it the moment they
  // finish reading the introduction.
  introDismissed: undefined;
  splashShow: undefined;
  // The previous release's splash, kept for anyone who missed it. Only ever opened by hand.
  splashShowV5: undefined;
  // The Raw Resources Wizard is mounted by OptionsDialog; this is how anything else asks for it.
  openRawWizard: undefined;
  // ...and how whatever opened it learns it is finished, applied or cancelled alike, so a deck
  // that stepped aside for the wizard can put itself back.
  rawWizardClosed: undefined;

  navigationReady: undefined;

  // Shown once, the first time a sink count is set above zero: the two build assumptions the
  // planner makes about a sink are invisible in the numbers, so they have to be said somewhere.
  openAwesomeSinkTutorial: undefined;
  // Same, for the first Uploader: says where the plan-wide summary lives, and what the planner
  // does and does not claim about what an Uploader takes off the belt.
  openDimensionalDepotTutorial: undefined;
  // "Take me there" from a dialog. Carries a section id for the planner's own jump helper, which
  // unhides a collapsed section before scrolling — a dialog cannot reach that helper directly.
  jumpToSection: string;

  // Building Groups
  openBuildingGroupTutorial: undefined;
  buildingGroupUpdated: Factory;
  toggleSidebar: undefined;
  sidebarChanged: boolean;
  // Opens the Factories Summary fullscreen. The payload is a group id to narrow it to, so a
  // sidebar group can reuse the whole table as its own breakdown; omitted means the whole plan.
  openSummaryFullscreen: string | undefined;
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
