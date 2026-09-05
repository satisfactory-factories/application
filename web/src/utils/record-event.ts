import type { EventReason } from 'common'
import { useEventsStore } from '@/stores/events-store'

/**
 * Count a fault from anywhere, without the caller needing the store.
 *
 * The indirection exists because these calls live in the calculation engine and in load-time
 * repair paths, which are plain functions that know nothing about Pinia and must not start.
 * Resolving the store lazily keeps that true, and means a module imported before Pinia is
 * active does not explode on import.
 *
 * **Never throws.** Every call site is already handling something that went wrong, and a
 * metric that can raise there would turn a repaired plan into a broken one.
 */
export const recordEvent = (reason: EventReason, count = 1): void => {
  try {
    useEventsStore().record(reason, count)
  } catch {
    // No active Pinia, or a store that would not construct. Losing a count is the correct
    // trade against interrupting a recovery path.
  }
}
