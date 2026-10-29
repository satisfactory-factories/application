import { ref, watch } from 'vue'

// How much detail the checklist panel shows. Reading preferences rather than part of the plan,
// so they live in this browser and are shared by every factory's checklist: flipping one on a
// card flips it on all of them, which is what a "less detail" switch means.
//
// - showIntermediates: list the intermediate lines indented under the line that consumes them,
//   or only the lines the factory exists to make. On by default.
// - showPlanned: the Planned column. Off by default: the numbers repeat what the product rows
//   and Imports already say, and the panel reads busier with them.
const preference = (key: string, fallback: boolean) => {
  let initial = fallback
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) initial = stored === 'true'
  } catch {
    // Private windows and blocked storage: fall back to the default.
  }

  const value = ref<boolean>(initial)
  watch(value, next => {
    try {
      localStorage.setItem(key, String(next))
    } catch {
      // The switch still works for this session.
    }
  })
  return value
}

const showIntermediates = preference('checklistShowIntermediates', true)
const showPlanned = preference('checklistShowPlanned', false)

export const useChecklistDisplay = () => ({ showIntermediates, showPlanned })
