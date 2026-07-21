import { ref } from 'vue'
import { debounce } from '@/components/planner/products/ItemCommon'

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
      debouncing.value = ''
    }
  }

  return { debouncing, runDebounced }
}
