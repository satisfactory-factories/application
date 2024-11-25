import mitt from 'mitt'

// Define the events you want to emit and listen for
type Events = {
  factoryUpdated: void; // No payload
};

const eventBus = mitt<Events>()

export default eventBus
