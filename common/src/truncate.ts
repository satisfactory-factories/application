import { CAPS } from './caps'
import type { Factory, FactoryTab } from './types/factory'
import type { RoomDiff } from './types/protocol'

// The truncate half of the validation table. These run *before* zod, on input that
// is not a Factory yet, so every field is type-checked before it is touched and
// anything unrecognised is left for zod to reject. Text is no longer cut here: an
// over-long name or note breaks a text rule and is refused (`text-rules.ts`).

type Loose = Record<string, unknown>

const isRecord = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null

/** Cuts a string to `max` characters. Shorter strings are returned unchanged. */
export const truncateString = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max) : value

/** Drops a factory's tasks past the count cap, in place, then returns the same object. */
export const truncateFactory = <T extends Factory>(factory: T): T => {
  if (!isRecord(factory)) return factory
  const { tasks } = factory as Loose
  if (Array.isArray(tasks) && tasks.length > CAPS.tasks) tasks.length = CAPS.tasks
  return factory
}

const truncateFactories = (target: Loose): void => {
  if (Array.isArray(target.factories)) {
    for (const factory of target.factories) truncateFactory(factory as Factory)
  }
}

/** Applies `truncateFactory` to every factory a tab holds, in place. */
export const truncateFactoryTab = <T extends FactoryTab>(tab: T): T => {
  if (isRecord(tab)) truncateFactories(tab as Loose)
  return tab
}

/** The op path: same rules as a tab, over the factories a diff can carry. */
export const truncateRoomDiff = <T extends RoomDiff>(diff: T): T => {
  if (isRecord(diff)) truncateFactories(diff as Loose)
  return diff
}
