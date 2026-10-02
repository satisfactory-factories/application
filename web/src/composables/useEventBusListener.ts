import { getCurrentScope, onScopeDispose } from 'vue'
import eventBus, { type Events } from '@/utils/eventBus'

/**
 * Listens on the event bus for as long as the calling component (or effect scope) lives.
 *
 * The planner remounts on every navigation, and a bare `eventBus.on` in setup outlives its
 * component: each dead instance keeps its whole scope reachable and still answers the next
 * `loadingCompleted`, so a plan load ends up doing its work once per visit. Registering here
 * pairs the `on` with an `off` when the scope is torn down, without having to name the handler.
 */
export const useEventBusListener = <K extends keyof Events>(
  type: K,
  handler: (event: Events[K]) => void,
) => {
  eventBus.on(type, handler)
  const stop = () => eventBus.off(type, handler)
  if (getCurrentScope()) onScopeDispose(stop)
  return stop
}
