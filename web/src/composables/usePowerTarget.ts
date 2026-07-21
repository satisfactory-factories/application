import { computed } from 'vue'
import { useAppStore } from '@/stores/app-store'

// The user's arbitrary grid generation target (MW). It exists because the plan can
// never model every in-game power consumer, so users aim for a number instead.
// Stored per-plan on the active factory tab so each plan keeps its own target and it
// travels with the plan on save/load.
export const usePowerTarget = () => {
  const appStore = useAppStore()

  const powerTarget = computed<number>({
    get () {
      const tab = appStore.getCurrentTab()
      if (tab?.powerTarget != null) {
        return tab.powerTarget
      }
      // Legacy fallback: users who set a global target before it became plan-specific
      // keep seeing it until they change it, at which point it saves onto the plan.
      const legacy = Number(localStorage.getItem('powerTarget'))
      return Number.isFinite(legacy) ? legacy : 0
    },
    set (value) {
      const tab = appStore.getCurrentTab()
      if (tab) {
        tab.powerTarget = Number.isFinite(value) ? value : 0
      }
    },
  })

  // Balance chips compare against the target when one is set, and fall back to the
  // plan's own consumption when it isn't — every consumer needs the same distinction.
  const hasTarget = computed<boolean>(() => powerTarget.value > 0)

  return { powerTarget, hasTarget }
}
