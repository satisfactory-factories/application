import { CAPS } from './caps'
import type { Factory, FactoryTab } from './types/factory'
import type { RoomDiff } from './types/protocol'

// The truncate half of the validation table. These run *before* zod, on input that
// is not a Factory yet, so every field is type-checked before it is touched and
// anything unrecognised is left for zod to reject.

type Loose = Record<string, unknown>

const isRecord = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null

/** Cuts a string to `max` characters. Shorter strings are returned unchanged. */
export const truncateString = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max) : value

const clamp = (target: Loose, key: string, max: number): void => {
  const value = target[key]
  if (typeof value === 'string') target[key] = truncateString(value, max)
}

/** Clamps a factory's name, notes and tasks in place, then returns the same object. */
export const truncateFactory = <T extends Factory>(factory: T): T => {
  if (!isRecord(factory)) return factory
  const target = factory as Loose

  clamp(target, 'name', CAPS.name)
  clamp(target, 'notes', CAPS.notes)

  const { tasks } = target
  if (Array.isArray(tasks)) {
    if (tasks.length > CAPS.tasks) tasks.length = CAPS.tasks
    for (const task of tasks) {
      if (isRecord(task)) clamp(task, 'title', CAPS.taskTitle)
    }
  }

  if (isRecord(target.group)) clamp(target.group, 'name', CAPS.name)

  return factory
}

/** Clamps a tab's name, its group registry and every factory it holds, in place. */
export const truncateFactoryTab = <T extends FactoryTab>(tab: T): T => {
  if (!isRecord(tab)) return tab
  const target = tab as Loose

  clamp(target, 'name', CAPS.name)

  if (Array.isArray(target.groups)) {
    for (const group of target.groups) {
      if (isRecord(group)) clamp(group, 'name', CAPS.name)
    }
  }

  if (Array.isArray(target.factories)) {
    for (const factory of target.factories) truncateFactory(factory as Factory)
  }

  return tab
}

/** The op path: same rules as a tab, over the fields a diff can carry. */
export const truncateRoomDiff = <T extends RoomDiff>(diff: T): T => {
  if (!isRecord(diff)) return diff
  const target = diff as Loose

  clamp(target, 'name', CAPS.name)

  if (Array.isArray(target.groups)) {
    for (const group of target.groups) {
      if (isRecord(group)) clamp(group, 'name', CAPS.name)
    }
  }

  if (Array.isArray(target.factories)) {
    for (const factory of target.factories) truncateFactory(factory as Factory)
  }

  return diff
}
