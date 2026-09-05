import { PREFERENCE_KEYS } from 'common'
import type { SyncedPreferences } from 'common'

/**
 * The synced preferences live in the same localStorage keys the components have
 * always read and written; this module is only the translation between those
 * strings and the typed object the server stores. Nothing in the planner had to
 * change to gain preference sync.
 */

type PreferenceKey = keyof SyncedPreferences

const ARRAY_KEYS = new Set<PreferenceKey>(['factoryGroupCustomColors'])

export const isPreferenceKey = (key: string): key is PreferenceKey =>
  (PREFERENCE_KEYS as string[]).includes(key)

const decode = (key: PreferenceKey, raw: string): boolean | string[] | undefined => {
  if (!ARRAY_KEYS.has(key)) return raw === 'true'

  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : undefined
  } catch {
    return undefined
  }
}

const encode = (value: boolean | string[]): string =>
  typeof value === 'boolean' ? String(value) : JSON.stringify(value)

/** Only the keys this browser actually holds; an absent key is not `false`. */
export const readLocalPreferences = (): SyncedPreferences => {
  const prefs: Record<string, unknown> = {}

  for (const key of PREFERENCE_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    const value = decode(key, raw)
    if (value !== undefined) prefs[key] = value
  }

  return prefs as SyncedPreferences
}

export const writeLocalPreferences = (prefs: SyncedPreferences): void => {
  for (const key of PREFERENCE_KEYS) {
    const value = (prefs as Record<string, unknown>)[key]
    if (typeof value !== 'boolean' && !Array.isArray(value)) continue
    localStorage.setItem(key, encode(value as boolean | string[]))
  }
}

/** Key-ordered, so two reads of the same preferences compare as strings. */
export const fingerprintPreferences = (prefs: SyncedPreferences): string =>
  JSON.stringify(PREFERENCE_KEYS.map(key => (prefs as Record<string, unknown>)[key] ?? null))
