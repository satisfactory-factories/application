import mitt from 'mitt'

type Events = {
  factoryUpdated: undefined; // No payload for this event
  loggedIn: undefined;
  sessionExpired: undefined;
  dataSynced: undefined;
  dataOutOfSync: undefined;
  toast: { message: string; type?: 'success' | 'warning' | 'error' };
  loadingCompleted: undefined;
  incrementLoad: { step: string }; // Payload to denote loading or calculation step
  prepareForLoad: { count: number, shown: number };
  readyForData: undefined;
  plannerShowContent: undefined
  plannerHideContent: undefined

  // Intro
  introShow: boolean;

  navigationReady: undefined;
};

const eventBus = mitt<Events>()

const originalEmit = eventBus.emit
eventBus.emit = <K extends keyof Events>(type: K, event?: Events[K]) => {
  console.log(`eventBus: Event emitted: ${type}`, event)
  originalEmit(type, event as Events[K])
}

export default eventBus
