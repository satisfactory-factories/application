import { ref, watch } from 'vue'

// Whether the checklist's Products group lists the intermediate lines indented under the line
// that consumes them, or only the lines the factory exists to make. A reading preference rather
// than part of the plan, so it lives in this browser and is shared by every factory's checklist:
// flipping it on one card flips it on all of them, which is what a "less detail" switch means.
const STORAGE_KEY = 'checklistShowIntermediates'

const read = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

const showIntermediates = ref<boolean>(read())

watch(showIntermediates, value => {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Private windows and blocked storage: the switch still works for this session.
  }
})

export const useChecklistIntermediates = () => ({ showIntermediates })
