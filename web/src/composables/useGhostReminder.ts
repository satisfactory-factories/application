import { useAppStore } from '@/stores/app-store'
import { useEventBusListener } from '@/composables/useEventBusListener'
import eventBus from '@/utils/eventBus'
import { GHOST_REMINDER_DAYS, ghostAgeLabel, staleGhosts } from '@/utils/factory-management/ghost'
import { Factory } from '@/interfaces/planner/FactoryInterface'

// Once per tab per page load: the point is to catch a player coming back, not to nag on every
// switch between tabs.
const reminded = new Set<string>()

/** The reminder line for a plan's old ghosts, or null when none have been out long enough. */
export const ghostReminderMessage = (factories: Factory[], now: Date = new Date()): string | null => {
  const stale = staleGhosts(factories, now)
  if (!stale.length) return null
  if (stale.length === 1) {
    return `Ghost factory "${stale[0].name}" has been left out of your power and resource totals for ` +
      `${ghostAgeLabel(stale[0], now)}. Use the ghost button on its card to count it again.`
  }
  return `${stale.length} ghost factories have been left out of your power and resource totals for ` +
    `over ${GHOST_REMINDER_DAYS} days. They are marked with a ghost in the sidebar.`
}

/**
 * Reminds a player, when a plan loads, that it holds ghost factories they turned off a while ago.
 * Without it a factory made a ghost before a two-week break quietly stays out of every total.
 */
export const useGhostReminder = () => {
  const appStore = useAppStore()

  useEventBusListener('loadingCompleted', () => {
    const tabId = appStore.getCurrentTab()?.id ?? ''
    if (reminded.has(tabId)) return
    const message = ghostReminderMessage(appStore.getFactories())
    if (!message) return
    reminded.add(tabId)
    eventBus.emit('toast', { message, type: 'info', variant: 'permanent' })
  })
}

/** For specs: forget which tabs have been reminded. */
export const resetGhostReminders = () => reminded.clear()
