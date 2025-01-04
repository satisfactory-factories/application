import mitt from 'mitt'

type Events = {
  factoryUpdated: undefined; // No payload for this event
  loggedIn: undefined;
  sessionExpired: undefined;
  dataSynced: undefined;
  dataOutOfSync: undefined;
  toast: { message: string; type?: 'success' | 'error' };
  loadingCompleted: undefined;
  incrementLoad: { step: string }; // Payload to denote loading or calculation step
  prepareForLoad: number;
  readyForData: undefined;
  hideLoading: undefined;
  plannerShowContent: undefined
};

const eventBus = mitt<Events>()

const originalEmit = eventBus.emit
eventBus.emit = <K extends keyof Events>(type: K, event?: Events[K]) => {
  console.log(`eventBus: Event emitted: ${type}`, event)
  originalEmit(type, event as Events[K])
}

export default eventBus
