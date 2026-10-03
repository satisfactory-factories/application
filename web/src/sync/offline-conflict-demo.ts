import { nextTick } from 'vue'
import type { Factory } from 'common'
import type { RoomContent } from '@/sync/room-state'
import { config } from '@/config/config'
import { useAppStore } from '@/stores/app-store'
import { useGameDataStore } from '@/stores/game-data-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { calculateFactories } from '@/utils/factory-management/factory'
import { DEMO_TOUCHED, offlineConflictDemoPlans } from '@/utils/factory-setups/offline-conflict-demo-plan'
import eventBus from '@/utils/eventBus'

/**
 * Dev-only: stage the offline conflict dialog on one machine, with no server and no
 * second device. It builds a local tab, seeds a small plan, fabricates a clash against a
 * plan it pretends the room holds, and hands that to the real store — so what opens is
 * the production dialog reading production state, not a mock of either.
 *
 * Nothing here reaches the network. The store stages the question against a pseudo-room
 * it deliberately never registers a `RoomState` for, and `flushRoom` — the only sender of
 * ops — refuses a room `rooms` does not hold on its first line. See `stageDemoConflict`.
 */

/** One console command on a preview build: `localStorage.sfDevTools = 'true'`. */
export const DEV_TOOLS_KEY = 'sfDevTools'

export const DEMO_TAB_NAME = 'Conflict demo'

/** How long to wait for the tab activation's load chain before giving up. */
const LOAD_SETTLE_TIMEOUT_MS = 15_000
const LOAD_POLL_MS = 25
const FRAME_TIMEOUT_MS = 100

/** A dev build always; anything else only once the flag is set by hand. */
export const devToolsEnabled = (): boolean => {
  if (import.meta.env.DEV) return true
  try {
    return localStorage.getItem(DEV_TOOLS_KEY) === 'true'
  } catch {
    return false
  }
}

export type DemoRefusal = 'dev-tools-off' | 'conflict-open' | 'tab-not-local' | 'no-game-data' | 'not-staged'

export type DemoResult = { ok: true, tabId: string } | { ok: false, reason: DemoRefusal }

const REFUSAL_TEXT: Record<DemoRefusal, string> = {
  'dev-tools-off': 'The offline conflict demo is a developer tool and is switched off here.',
  'conflict-open': 'There is already an offline conflict on screen. Answer that one first.',
  'tab-not-local': 'Switch to a local tab first: the demo will not run on a synced or shared one.',
  'no-game-data': 'The game data has not loaded yet, so the demo has nothing to build a plan from.',
  'not-staged': 'The demo could not stage its clash. Try again once the planner has settled.',
}

const refuse = (reason: DemoRefusal): DemoResult => {
  eventBus.emit('toast', {
    message: REFUSAL_TEXT[reason],
    type: 'warning',
    variant: 'timed',
    timeout: 8000,
  })
  return { ok: false, reason }
}

const contentOf = (name: string, factories: Factory[]): RoomContent => ({
  name,
  powerTarget: 0,
  groups: [],
  factories,
})

/** A hidden tab never paints, so the frame is raced against a timer rather than awaited. */
const nextFrame = (): Promise<void> =>
  new Promise(resolve => {
    const timer = setTimeout(resolve, FRAME_TIMEOUT_MS)
    if (typeof requestAnimationFrame !== 'function') return
    requestAnimationFrame(() => {
      clearTimeout(timer)
      resolve()
    })
  })

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Activating a tab queues a load chain, and an answer given while one owns the plan parks
 * — with nothing to retry it for a room the engine does not track. So the question is not
 * asked until the chain has handed the plan back. The two frames are the tab watcher's
 * own `requestAnimationFrame`, which has not run yet when `nextTick` resolves.
 */
const planSettled = async (appStore: ReturnType<typeof useAppStore>, tabId: string): Promise<boolean> => {
  await nextTick()
  await nextFrame()
  await nextFrame()

  const deadline = Date.now() + LOAD_SETTLE_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (appStore.isLoaded && !appStore.isTabLoading(tabId)) return true
    await delay(LOAD_POLL_MS)
  }
  return false
}

export const runOfflineConflictDemo = async (): Promise<DemoResult> => {
  if (!devToolsEnabled()) return refuse('dev-tools-off')

  const appStore = useAppStore()
  const roomSync = useRoomSyncStore()

  // A real question owns the dialog: it shows one room at a time, and a demo stacked
  // behind it would answer for a room the user has not looked at yet.
  if (Object.keys(roomSync.conflicts).length > 0) return refuse('conflict-open')

  // The demo makes its own tab, so this is only about being invoked from an odd place:
  // nothing it does should be able to reach a real room's state.
  const current = appStore.getCurrentTab()
  if (current && appStore.getTabState(current.id).kind !== 'local') return refuse('tab-not-local')

  let data
  try {
    data = useGameDataStore().getGameData()
  } catch {
    return refuse('no-game-data')
  }

  const plans = offlineConflictDemoPlans()
  // The origin a quantity field itself uses. On `recalculate` the building groups are
  // sacrosanct and the seeded amounts are pulled straight back to them.
  for (const plan of [plans.baseline, plans.live, plans.mine]) {
    calculateFactories(plan, data, { origin: 'item' })
  }

  const tabId = appStore.addTab({
    name: DEMO_TAB_NAME,
    factories: plans.mine,
    powerTarget: 0,
    groups: [],
    // Built by today's code, so it has never assumed a raw resource. Unstamped, `addTab`
    // reads a tab arriving with factories as an imported plan and the load raises the
    // one-time raw-resources notice over the dialog the demo exists to show.
    plannerVersion: config.plannerVersion,
  }, { activate: true })

  await planSettled(appStore, tabId)

  const staged = roomSync.stageDemoConflict({
    roomId: tabId,
    baseline: contentOf(DEMO_TAB_NAME, plans.baseline),
    live: contentOf(DEMO_TAB_NAME, plans.live),
    touchedFactories: DEMO_TOUCHED,
  })
  if (!staged) return refuse('not-staged')

  return { ok: true, tabId }
}
