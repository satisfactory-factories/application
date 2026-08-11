import { ref } from 'vue'
import { groupPalette } from '@/utils/colors'

/**
 * Custom group colours the user has picked before.
 *
 * Local to the browser and deliberately not part of the plan: it is a record of what someone
 * reaches for, not of what the plan is, so it has no business travelling through a share link or
 * a cloud restore. Module scope, so the two mounted sidebars and the create dialog all show the
 * same row. Preset colours are never recorded — they already have a row of their own.
 */
const STORAGE_KEY = 'factoryGroupCustomColors'
const LIMIT = 12

const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)

const restore = (): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter(isHex).slice(0, LIMIT) : []
  } catch {
    return []
  }
}

const customColors = ref<string[]>(restore())

const isPreset = (hex: string) =>
  groupPalette.some(entry => entry.value.toLowerCase() === hex)

export const useGroupColorHistory = () => {
  const remember = (color: string) => {
    const hex = color.slice(0, 7).toLowerCase()
    if (!isHex(hex) || isPreset(hex)) return

    // Most recent first, and picking one again moves it back to the front rather than duplicating.
    customColors.value = [hex, ...customColors.value.filter(entry => entry !== hex)].slice(0, LIMIT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customColors.value))
  }

  const forget = () => {
    customColors.value = []
    localStorage.removeItem(STORAGE_KEY)
  }

  return { customColors, remember, forget }
}
