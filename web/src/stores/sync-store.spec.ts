import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETRY_DELAYS_MS, SAVE_DEBOUNCE_MS, useSyncStore } from '@/stores/sync-store'
import { FactoryTab } from '@/interfaces/planner/FactoryInterface'
import eventBus from '@/utils/eventBus'

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}))

const makeTab = (id: string, name = `Tab ${id}`): FactoryTab => ({
  id,
  name,
  factories: [],
})

describe('useSyncStore', () => {
  let syncStore: ReturnType<typeof useSyncStore>
  let mockAuthStore: Record<string, any>
  let mockAppStore: Record<string, any>
  let mockSyncActions: Record<string, any>
  let tabs: FactoryTab[]

  const createStore = () => useSyncStore({
    authStore: mockAuthStore,
    appStore: mockAppStore,
    syncActions: mockSyncActions,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    localStorage.removeItem('tabSyncMeta')

    tabs = [makeTab('tab-1'), makeTab('tab-2')]

    mockAuthStore = {
      getLoggedInUser: vi.fn().mockReturnValue('testuser'),
      getToken: vi.fn().mockResolvedValue('mock-token'),
      validateToken: vi.fn().mockResolvedValue(true),
    }
    mockAppStore = {
      isLoaded: true,
      lastSave: new Date(),
      currentFactoryTabIndex: 0,
      getTabs: vi.fn(() => tabs),
      getTab: vi.fn((id: string) => tabs.find(tab => tab.id === id)),
      getCurrentTab: vi.fn(() => tabs[0]),
      getLastEdit: vi.fn(() => new Date(Date.now() - 1000 * 60)),
      setTabs: vi.fn(),
      setLastSave: vi.fn(),
    }
    mockSyncActions = {
      loadTabMeta: vi.fn().mockResolvedValue({ tabs: [], migrated: false }),
      loadAllTabs: vi.fn().mockResolvedValue({ tabs: [], migrated: false }),
      saveTab: vi.fn().mockResolvedValue({ lastSaved: new Date().toISOString() }),
      saveTabMeta: vi.fn().mockResolvedValue({ lastSaved: new Date().toISOString() }),
      deleteTab: vi.fn().mockResolvedValue(undefined),
      saveTabOrder: vi.fn().mockResolvedValue(undefined),
    }

    syncStore = createStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('queueTabSave debouncing', () => {
    it('waits out the debounce window before saving', async () => {
      syncStore.queueTabSave('tab-1')

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 100)
      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(100)
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(1)
      expect(mockSyncActions.saveTab).toHaveBeenCalledWith(tabs[0], 0)
    })

    it('coalesces rapid changes to the same tab into one save', async () => {
      syncStore.queueTabSave('tab-1')
      await vi.advanceTimersByTimeAsync(1000)
      syncStore.queueTabSave('tab-1') // resets the trailing timer
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(1)
    })

    it('saves different tabs independently', async () => {
      syncStore.queueTabSave('tab-1')
      syncStore.queueTabSave('tab-2')

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(2)
      expect(mockSyncActions.saveTab).toHaveBeenCalledWith(tabs[0], 0)
      expect(mockSyncActions.saveTab).toHaveBeenCalledWith(tabs[1], 1)
    })

    it('does nothing when logged out', async () => {
      mockAuthStore.getLoggedInUser.mockReturnValue('')
      syncStore.queueTabSave('tab-1')

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2)
      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()
    })

    it('does nothing while the app store is still loading', async () => {
      mockAppStore.isLoaded = false
      syncStore.queueTabSave('tab-1')

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2)
      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()
    })

    it('does nothing while sync is suppressed (remote data being applied)', async () => {
      syncStore.suppressSync.value = true
      syncStore.queueTabSave('tab-1')

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2)
      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()
    })

    it('records the server lastSaved per tab on success', async () => {
      const lastSaved = new Date('2026-07-19T12:00:00Z').toISOString()
      mockSyncActions.saveTab.mockResolvedValue({ lastSaved })

      syncStore.queueTabSave('tab-1')
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)

      expect(syncStore.tabSyncMeta.value['tab-1']).toBe(lastSaved)
      expect(JSON.parse(localStorage.getItem('tabSyncMeta') ?? '{}')['tab-1']).toBe(lastSaved)
      expect(mockAppStore.setLastSave).toHaveBeenCalled()
      expect(eventBus.emit).toHaveBeenCalledWith('dataSynced')
    })
  })

  describe('in-flight coalescing', () => {
    it('queues changes arriving mid-request and follows up with one dispatch', async () => {
      let resolveFirstSave: (value: { lastSaved: string }) => void = () => {}
      mockSyncActions.saveTab
        .mockImplementationOnce(() => new Promise(resolve => { resolveFirstSave = resolve }))
        .mockResolvedValue({ lastSaved: new Date().toISOString() })

      syncStore.queueTabSave('tab-1')
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(1)

      // A change to another tab lands while tab-1's request is still in flight
      syncStore.queueTabSave('tab-2')
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)

      resolveFirstSave({ lastSaved: new Date().toISOString() })
      await vi.advanceTimersByTimeAsync(0)

      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(2)
      expect(mockSyncActions.saveTab).toHaveBeenLastCalledWith(tabs[1], 1)
    })
  })

  describe('queueTabDelete', () => {
    it('cancels any pending save for the tab and deletes it with an order sync', async () => {
      syncStore.queueTabSave('tab-2')
      syncStore.queueTabDelete('tab-2')

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2)

      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()
      expect(mockSyncActions.deleteTab).toHaveBeenCalledWith('tab-2')
      expect(mockSyncActions.saveTabOrder).toHaveBeenCalled()
    })
  })

  describe('flushPendingSaves', () => {
    it('promotes debounced saves immediately', async () => {
      syncStore.queueTabSave('tab-1')
      syncStore.flushPendingSaves()

      await vi.advanceTimersByTimeAsync(0)
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(1)
    })
  })

  describe('retry and pause behaviour', () => {
    it('retries with backoff and recovers on success', async () => {
      mockSyncActions.saveTab
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({ lastSaved: new Date().toISOString() })

      syncStore.queueTabSave('tab-1')
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(1)
      expect(syncStore.syncPaused.value).toBe(false)

      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(2)
      expect(syncStore.syncPaused.value).toBe(false)
      expect(eventBus.emit).toHaveBeenCalledWith('dataSynced')
    })

    it('pauses after exhausting all retries and emits an error toast', async () => {
      mockSyncActions.saveTab.mockRejectedValue(new Error('boom'))

      syncStore.queueTabSave('tab-1')
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
      for (const delay of RETRY_DELAYS_MS) {
        await vi.advanceTimersByTimeAsync(delay)
      }

      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1)
      expect(syncStore.syncPaused.value).toBe(true)
      expect(eventBus.emit).toHaveBeenCalledWith('toast', expect.objectContaining({ type: 'error' }))

      // Paused means no further attempts, even with new queue entries pending
      await vi.advanceTimersByTimeAsync(60000)
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1)
    })

    it('re-arms when the user edits again while paused', async () => {
      mockSyncActions.saveTab.mockRejectedValue(new Error('boom'))
      syncStore.queueTabSave('tab-1')
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
      for (const delay of RETRY_DELAYS_MS) {
        await vi.advanceTimersByTimeAsync(delay)
      }
      expect(syncStore.syncPaused.value).toBe(true)

      mockSyncActions.saveTab.mockResolvedValue({ lastSaved: new Date().toISOString() })
      syncStore.queueTabSave('tab-1')
      expect(syncStore.syncPaused.value).toBe(false)

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
      expect(syncStore.tabSyncMeta.value['tab-1']).toBeDefined()
    })

    it('retrySync clears the pause and dispatches pending work', async () => {
      mockSyncActions.saveTab.mockRejectedValue(new Error('boom'))
      syncStore.queueTabSave('tab-1')
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
      for (const delay of RETRY_DELAYS_MS) {
        await vi.advanceTimersByTimeAsync(delay)
      }
      expect(syncStore.syncPaused.value).toBe(true)

      mockSyncActions.saveTab.mockResolvedValue({ lastSaved: new Date().toISOString() })
      syncStore.retrySync()
      await vi.advanceTimersByTimeAsync(0)

      expect(syncStore.syncPaused.value).toBe(false)
      expect(syncStore.tabSyncMeta.value['tab-1']).toBeDefined()
    })
  })

  describe('handleLoggedInEvent decision tree', () => {
    it('silently pushes all local tabs when the server is empty (registration path)', async () => {
      mockSyncActions.loadTabMeta.mockResolvedValue({ tabs: [], migrated: false })
      tabs[0].factories = [{ id: 1 } as any]

      await syncStore.handleLoggedInEvent()

      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(2)
      expect(mockSyncActions.saveTabOrder).toHaveBeenCalledWith([
        { tabId: 'tab-1', order: 0 },
        { tabId: 'tab-2', order: 1 },
      ])
      expect(mockAppStore.setTabs).not.toHaveBeenCalled()
    })

    it('silently pulls server data when local is pristine', async () => {
      tabs = [makeTab('fresh-default', 'Default')] // single empty tab
      mockSyncActions.loadTabMeta.mockResolvedValue({
        tabs: [{ tabId: 'remote-1', name: 'Remote', order: 0, lastSaved: new Date().toISOString() }],
        migrated: false,
      })
      mockSyncActions.loadAllTabs.mockResolvedValue({
        tabs: [{ tabId: 'remote-1', name: 'Remote', order: 0, lastSaved: new Date().toISOString(), data: [] }],
        migrated: false,
      })

      await syncStore.handleLoggedInEvent()

      expect(mockAppStore.setTabs).toHaveBeenCalledWith([
        { id: 'remote-1', name: 'Remote', factories: [] },
      ])
      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()
      expect(eventBus.emit).not.toHaveBeenCalledWith('dataMergeRequired')
    })

    it('does nothing when local and server are already in sync', async () => {
      const lastSaved = new Date('2026-07-19T10:00:00Z')
      tabs[0].factories = [{ id: 1 } as any]
      mockSyncActions.loadTabMeta.mockResolvedValue({
        tabs: [
          { tabId: 'tab-1', name: 'Tab tab-1', order: 0, lastSaved: lastSaved.toISOString() },
          { tabId: 'tab-2', name: 'Tab tab-2', order: 1, lastSaved: lastSaved.toISOString() },
        ],
        migrated: false,
      })
      localStorage.setItem('tabSyncMeta', JSON.stringify({
        'tab-1': lastSaved.toISOString(),
        'tab-2': lastSaved.toISOString(),
      }))
      mockAppStore.getLastEdit = vi.fn(() => new Date('2026-07-19T09:00:00Z'))
      mockAppStore.lastSave = new Date('2026-07-19T09:30:00Z')
      syncStore = createStore()

      await syncStore.handleLoggedInEvent()

      expect(mockAppStore.setTabs).not.toHaveBeenCalled()
      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()
      expect(eventBus.emit).not.toHaveBeenCalledWith('dataMergeRequired')
    })

    it('asks the user to decide when both sides have differing data', async () => {
      tabs[0].factories = [{ id: 1 } as any]
      mockSyncActions.loadTabMeta.mockResolvedValue({
        tabs: [{ tabId: 'remote-1', name: 'Remote', order: 0, lastSaved: new Date().toISOString() }],
        migrated: false,
      })

      await syncStore.handleLoggedInEvent()

      expect(eventBus.emit).toHaveBeenCalledWith('dataMergeRequired')
      expect(mockAppStore.setTabs).not.toHaveBeenCalled()
      expect(mockSyncActions.saveTab).not.toHaveBeenCalled()
    })

    it('leaves local data alone and toasts when the server check fails', async () => {
      mockSyncActions.loadTabMeta.mockRejectedValue(new Error('server down'))

      await syncStore.handleLoggedInEvent()

      expect(mockAppStore.setTabs).not.toHaveBeenCalled()
      expect(eventBus.emit).toHaveBeenCalledWith('toast', expect.objectContaining({ type: 'error' }))
    })
  })

  describe('mergeServerData', () => {
    it('appends local tabs after remote ones and pushes them', async () => {
      const remoteSaved = new Date().toISOString()
      mockSyncActions.loadAllTabs.mockResolvedValue({
        tabs: [{ tabId: 'remote-1', name: 'Tab tab-1', order: 0, lastSaved: remoteSaved, data: [] }],
        migrated: false,
      })
      // tab-1 collides with the remote tab by name; both locals get kept
      tabs = [makeTab('tab-1'), makeTab('tab-2')]
      let appliedTabs: FactoryTab[] = []
      mockAppStore.setTabs = vi.fn((newTabs: FactoryTab[]) => { appliedTabs = newTabs; tabs = newTabs })

      await syncStore.mergeServerData()

      expect(appliedTabs).toHaveLength(3)
      expect(appliedTabs[0].id).toBe('remote-1')
      expect(appliedTabs[1].name).toBe('Tab tab-1 (local)')
      // Both local tabs got pushed, plus a final order sync
      expect(mockSyncActions.saveTab).toHaveBeenCalledTimes(2)
      expect(mockSyncActions.saveTabOrder).toHaveBeenCalledTimes(1)
    })
  })

  describe('applyServerData', () => {
    it('replaces local tabs and records sync meta', async () => {
      const remoteSaved = new Date().toISOString()
      mockSyncActions.loadAllTabs.mockResolvedValue({
        tabs: [{ tabId: 'remote-1', name: 'Remote', order: 0, lastSaved: remoteSaved, data: [] }],
        migrated: false,
      })

      await syncStore.applyServerData()

      expect(mockAppStore.setTabs).toHaveBeenCalledWith([{ id: 'remote-1', name: 'Remote', factories: [] }])
      expect(syncStore.tabSyncMeta.value['remote-1']).toBe(remoteSaved)
      expect(syncStore.suppressSync.value).toBe(false)
    })

    it('refuses to blow away local data when the server unexpectedly has none', async () => {
      mockSyncActions.loadAllTabs.mockResolvedValue({ tabs: [], migrated: false })

      await syncStore.applyServerData()

      expect(mockAppStore.setTabs).not.toHaveBeenCalled()
    })
  })
})
