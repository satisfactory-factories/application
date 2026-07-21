import { nextTick, ref } from 'vue'
import { debounce } from '@/components/planner/products/ItemCommon'

// Resolves once the DOM changes from the last action have actually been painted:
// nextTick waits for Vue's render flush, the double requestAnimationFrame waits for
// the browser to produce a frame with those changes on screen. Used so spinner
// exit animations start on an idle frame instead of mid-jank.
export const afterRender = (): Promise<void> => new Promise(resolve => {
  nextTick(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
})

// Debounces the expensive part of an input edit (the whole-plan recalculation) while
// the v-model mutation itself lands instantly. Callers mutate their data immediately,
// then pass only the recalc/update work here; superseded actions are dropped, which is
// safe because the final action recalculates from the already-mutated current state.
//
// `debouncing` holds the key of the input currently waiting (drives a DebounceSpinner).
export const useDebouncedAction = () => {
  const debouncing = ref('')
  let callId = 0

  const runDebounced = async (key: string, action: () => void) => {
    const id = ++callId
    debouncing.value = key

    await debounce()

    // A newer edit arrived while waiting — let its call do the (single) recalculation.
    if (id !== callId) return

    try {
      action()
    } finally {
      // Hold the spinner until the recalc's DOM updates have painted, so its exit
      // animation runs smoothly instead of during the re-render.
      await afterRender()
      if (id === callId) {
        debouncing.value = ''
      }
    }
  }

  return { debouncing, runDebounced }
}
