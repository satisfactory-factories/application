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
  // Plan-level state changed (the planner version, and anything else held on the tab rather
  // than on a factory). Persistence and the cloud dirty flag both hang off factoryUpdated, so
  // without this a tab-level edit is saved by nothing.
  planUpdated: undefined;
  loggedIn: undefined;
  sessionExpired: undefined;
  // The version gate fired: an HTTP 426, or a socket closed 4426. `body` is only
  // present on the REST side, where the server states what it wanted.
  versionMismatch: { source: 'rest' | 'ws', body?: VersionMismatchBody };
  // The same refusal reached through a raw fetch that does not go via api/client.ts, which
  // reports the minimum the server named rather than the body.
  clientOutdated: { minimumVersion: string };
  // A newer release is live. Advisory, unlike the version gate: this build still works, so the
  // user is offered a reload rather than made to do one.
  updateAvailable: { version: string };
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
  // Checklist mode: fired the first time any factory's checklist toggle is switched on and the
  // player hasn't dismissed the explainer yet.
  openChecklistTutorial: undefined;
  toggleSidebar: undefined;
  sidebarChanged: boolean;
  // Opens the Factories Summary fullscreen. The payload is a group id to narrow it to, so a
  // sidebar group can reuse the whole table as its own breakdown; omitted means the whole plan.
  openSummaryFullscreen: string | undefined;
  // Sidebar jump-links: unhide the target section (by element id) before scrolling to it.
  openSection: string;
  // Search results: jump to a factory, landing on one of its rows where the result names one.
  // The search box lives in the tab bar, which is outside the planner's provide() scope, so it
  // has to ask over the bus rather than calling navigateToFactory itself.
  jumpToFactory: { factoryId: number, targets?: string[], fallback?: string };
}

const eventBus = mitt<Events>()

const originalEmit = eventBus.emit
eventBus.emit = <K extends keyof Events>(type: K, event?: Events[K]) => {
  console.log(`eventBus: Event emitted: ${type}`, event)
  originalEmit(type, event as Events[K])
}

export default eventBus
