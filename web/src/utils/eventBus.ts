import mitt from 'mitt'
import { Factory } from '@/interfaces/planner/FactoryInterface'

type Events = {
  factoryUpdated: undefined; // No payload for this event
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

  navigationReady: undefined;

  // Building Groups
  openBuildingGroupTutorial: undefined;
  buildingGroupUpdated: Factory;
};

const eventBus = mitt<Events>()

const originalEmit = eventBus.emit
eventBus.emit = <K extends keyof Events>(type: K, event?: Events[K]) => {
  console.log(`eventBus: Event emitted: ${type}`, event)
  originalEmit(type, event as Events[K])
}

export default eventBus
