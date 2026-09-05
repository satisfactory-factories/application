import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  DEMO_TAB_NAME,
  DEV_TOOLS_KEY,
  devToolsEnabled,
  runOfflineConflictDemo,
} from '@/sync/offline-conflict-demo'
import { useAppStore } from '@/stores/app-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import eventBus from '@/utils/eventBus'
import { config } from '@/config/config'

const HOME = 'home-tab'

describe('the offline conflict demo', () => {
  let appStore: ReturnType<typeof useAppStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>

  const tabNames = () => appStore.getTabs().map(tab => tab.name)

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    appStore = useAppStore()
    roomSync = useRoomSyncStore()
    appStore.isLoaded = true
    appStore.factoryTabs.splice(0, appStore.factoryTabs.length, {
      id: HOME,
      name: 'My plan',
      factories: [],
      powerTarget: 0,
      groups: [],
    })
    // Vitest runs as a dev build, which would switch the demo on by itself.
    vi.stubEnv('DEV', false)
    localStorage.setItem(DEV_TOOLS_KEY, 'true')
  })

  afterEach(() => {
    roomSync.dispose()
    vi.unstubAllEnvs()
  })

  describe('the visibility flag', () => {
    it('is off on a normal build with nobody having asked', () => {
      localStorage.removeItem(DEV_TOOLS_KEY)

      expect(devToolsEnabled()).toBe(false)
    })

    it('is on for a dev build', () => {
      vi.stubEnv('DEV', true)
      localStorage.removeItem(DEV_TOOLS_KEY)

      expect(devToolsEnabled()).toBe(true)
    })

    it('is on anywhere the flag is set to the exact string', () => {
      expect(devToolsEnabled()).toBe(true)

      localStorage.setItem(DEV_TOOLS_KEY, '1')
      expect(devToolsEnabled()).toBe(false)
    })
  })

  describe('refusals', () => {
    it('does nothing at all when the dev tools are off', async () => {
      localStorage.removeItem(DEV_TOOLS_KEY)

      expect(await runOfflineConflictDemo()).toEqual({ ok: false, reason: 'dev-tools-off' })
      expect(tabNames()).toEqual(['My plan'])
    })

    it('stands aside for a real question already on screen', async () => {
      roomSync.conflicts['room-9'] = { roomId: 'room-9', factories: [] }

      expect(await runOfflineConflictDemo()).toEqual({ ok: false, reason: 'conflict-open' })
      expect(tabNames()).toEqual(['My plan'])
    })

    it('refuses to run from a synced tab', async () => {
      appStore.setTabState(HOME, { kind: 'synced', shared: false, role: 'owner', revision: 3 })

      expect(await runOfflineConflictDemo()).toEqual({ ok: false, reason: 'tab-not-local' })
      expect(tabNames()).toEqual(['My plan'])
    })

    it('refuses to run from a shared tab', async () => {
      appStore.setTabState(HOME, { kind: 'joined', shared: true, role: 'member', revision: 3 })

      expect(await runOfflineConflictDemo()).toEqual({ ok: false, reason: 'tab-not-local' })
      expect(tabNames()).toEqual(['My plan'])
    })
  })

  describe('a staged demo', () => {
    it('opens the real question over a local tab of its own', async () => {
      const emit = vi.spyOn(eventBus, 'emit')
      const result = await runOfflineConflictDemo()

      expect(result.ok, 'the demo refused to stage').toBe(true)
      const tabId = result.ok ? result.tabId : ''

      expect(tabNames()).toEqual(['My plan', DEMO_TAB_NAME])
      expect(appStore.getCurrentTab()?.id).toBe(tabId)
      // Proof it waited: activating the tab ran a load chain, and staging refuses while one
      // owns the plan — so a question at all means the chain had finished first.
      expect(emit).toHaveBeenCalledWith('loadingCompleted')

      const asked = roomSync.conflicts[tabId]?.factories ?? []
      expect(asked.map(row => row.factoryId)).toEqual([1, 2, 3, 4])
      expect(asked.some(row => row.liveDeleted)).toBe(true)
      expect(asked.some(row => row.mineDeleted)).toBe(true)
      expect(asked.some(row => row.otherChanges)).toBe(true)
      expect(asked.some(row => row.products.some(product => product.recipeChanged))).toBe(true)

      // The whole sandbox: a question and an engine, and no room for anything to send to.
      expect(Object.keys(roomSync.rooms)).toEqual([])
      // Stamped as answered, or the load raises the raw-resources notice over the dialog.
      expect(appStore.getTab(tabId)?.plannerVersion).toBe(config.plannerVersion)
    })
  })
})
