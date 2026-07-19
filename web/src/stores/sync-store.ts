import { ref, watch } from 'vue'
import eventBus from '@/utils/eventBus'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { SyncActions } from '@/stores/sync/sync-actions'
import { mergeTabs } from '@/utils/sync/tab-merge'
import { BackendTabEntry } from '@/interfaces/BackendFactoryDataResponse'
import { FactoryTab } from '@/interfaces/planner/FactoryInterface'

// Wait at least this long after the user's last change to a tab before saving it,
// so e.g. typing a quantity doesn't fire a request per keystroke.
export const SAVE_DEBOUNCE_MS = 2000
// Backoff schedule for failed saves. After the last attempt, syncing pauses until the
// user edits again or manually retries.
export const RETRY_DELAYS_MS = [2000, 5000, 15000]

// Overrides used for dependency injecting mocks into the store when under test.
interface SyncStoreOverrides {
  authStore?: any
  appStore?: any
  syncActions?: any
}

const createSyncStore = (overrides?: SyncStoreOverrides) => {
  const dataLastSaved = ref<Date | null>(null)
  const syncPaused = ref<boolean>(false)
  // Set while remote data is being applied locally — the apply mutates factories, which
  // emits factoryUpdated events that must not immediately re-push mid-merge.
  const suppressSync = ref<boolean>(false)
  const inFlight = ref<boolean>(false)

  const pendingTabIds = new Set<string>()
  const pendingDeletes = new Set<string>()
  let pendingOrderSync = false
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let retryAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const authStore = overrides?.authStore ?? useAuthStore()
  const appStore = overrides?.appStore ?? useAppStore()
  const syncActions = overrides?.syncActions ?? new SyncActions(authStore, appStore)

  // Per-tab record of the server's lastSaved timestamps from our own successful saves and
  // pulls. Used at login to detect the "nothing changed anywhere" case.
  const tabSyncMeta = ref<Record<string, string>>(JSON.parse(localStorage.getItem('tabSyncMeta') ?? '{}'))
  const setTabSyncMeta = (tabId: string, lastSaved: string | Date) => {
    tabSyncMeta.value[tabId] = new Date(lastSaved).toISOString()
    localStorage.setItem('tabSyncMeta', JSON.stringify(tabSyncMeta.value))
  }
  const removeTabSyncMeta = (tabId: string) => {
    delete tabSyncMeta.value[tabId]
    localStorage.setItem('tabSyncMeta', JSON.stringify(tabSyncMeta.value))
  }

  const canSync = () => {
    if (!authStore.getLoggedInUser()) return false
    if (suppressSync.value) return false
    if (!appStore.isLoaded) return false
    return true
  }

  // A new change while paused re-arms the retry cycle.
  const reArmIfPaused = () => {
    if (syncPaused.value) {
      console.log('syncStore: Change detected while paused, re-arming sync.')
      syncPaused.value = false
      retryAttempt = 0
    }
  }

  const queueTabSave = (tabId: string) => {
    if (!canSync()) return
    reArmIfPaused()

    clearTimeout(debounceTimers.get(tabId))
    debounceTimers.set(tabId, setTimeout(() => {
      debounceTimers.delete(tabId)
      pendingTabIds.add(tabId)
      void dispatch()
    }, SAVE_DEBOUNCE_MS))
  }

  const queueTabDelete = (tabId: string) => {
    if (!canSync()) return
    reArmIfPaused()

    // A pending save for a deleted tab is moot — the delete wins.
    clearTimeout(debounceTimers.get(tabId))
    debounceTimers.delete(tabId)
    pendingTabIds.delete(tabId)

    pendingDeletes.add(tabId)
    pendingOrderSync = true
    void dispatch()
  }

  const queueOrderSync = () => {
    if (!canSync()) return
    reArmIfPaused()

    pendingOrderSync = true
    void dispatch()
  }

  // Promotes any debounced saves straight into the pending queue and dispatches. Used when
  // the debounce window shouldn't be waited out: tab switch, page hide / unload.
  const flushPendingSaves = () => {
    for (const [tabId, timer] of debounceTimers) {
      clearTimeout(timer)
      pendingTabIds.add(tabId)
    }
    debounceTimers.clear()

    if (hasPending()) {
      void dispatch()
    }
  }

  const clearQueues = () => {
    debounceTimers.forEach(timer => clearTimeout(timer))
    debounceTimers.clear()
    pendingTabIds.clear()
    pendingDeletes.clear()
    pendingOrderSync = false
    clearTimeout(retryTimer)
    retryAttempt = 0
  }

  const hasPending = () => pendingTabIds.size > 0 || pendingDeletes.size > 0 || pendingOrderSync

  const buildOrderPayload = () =>
    appStore.getTabs().map((tab: FactoryTab, index: number) => ({ tabId: tab.id, order: index }))

  // Works through the pending queues sequentially. Only one dispatch loop runs at a time —
  // changes arriving while a request is in flight are queued and handled by the same loop
  // (or a follow-up), which is what coalesces edit bursts into few requests.
  const dispatch = async () => {
    if (inFlight.value || syncPaused.value || suppressSync.value) return

    inFlight.value = true
    try {
      while (hasPending()) {
        if (suppressSync.value) return

        const saves = [...pendingTabIds]
        pendingTabIds.clear()
        const deletes = [...pendingDeletes]
        pendingDeletes.clear()
        const orderSync = pendingOrderSync
        pendingOrderSync = false

        try {
          for (const tabId of saves) {
            const tab = appStore.getTab(tabId)
            if (!tab) continue // Deleted since queueing
            const order = appStore.getTabs().findIndex((candidate: FactoryTab) => candidate.id === tabId)
            const result = await syncActions.saveTab(tab, order)
            setTabSyncMeta(tabId, result.lastSaved)
          }

          for (const tabId of deletes) {
            await syncActions.deleteTab(tabId)
            removeTabSyncMeta(tabId)
          }

          if (orderSync) {
            await syncActions.saveTabOrder(buildOrderPayload())
          }

          retryAttempt = 0
          dataLastSaved.value = new Date()
          appStore.setLastSave()
          eventBus.emit('dataSynced')
        } catch (error) {
          // Requeue the whole failed batch and back off
          saves.forEach(tabId => pendingTabIds.add(tabId))
          deletes.forEach(tabId => pendingDeletes.add(tabId))
          if (orderSync) pendingOrderSync = true

          handleSyncFailure(error)
          return
        }
      }
    } finally {
      inFlight.value = false
    }
  }

  const handleSyncFailure = (error: unknown) => {
    console.error('syncStore: Sync failed:', error)

    if (retryAttempt < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[retryAttempt]
      retryAttempt++
      console.log(`syncStore: Retrying sync in ${delay}ms (attempt ${retryAttempt}/${RETRY_DELAYS_MS.length})`)
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => void dispatch(), delay)
      return
    }

    syncPaused.value = true
    eventBus.emit('toast', {
      message: 'Syncing is paused due to repeated save failures. Your changes are safe on this device — editing the plan or pressing Retry will attempt to sync again.',
      type: 'error',
    })
  }

  const retrySync = () => {
    console.log('syncStore: Manual sync retry requested.')
    syncPaused.value = false
    retryAttempt = 0
    flushPendingSaves()
    void dispatch()
  }

  // Resolves once the app store has finished applying + loading a plan, so post-apply
  // bookkeeping doesn't race the loading handshake's mutations.
  const waitForLoaded = () => new Promise<void>(resolve => {
    if (appStore.isLoaded) {
      resolve()
      return
    }
    const done = () => {
      eventBus.off('loadingCompleted', done)
      clearTimeout(failsafe)
      resolve()
    }
    // Failsafe so a wedged load can never hang the login flow forever
    const failsafe = setTimeout(done, 30000)
    eventBus.on('loadingCompleted', done)
  })

  const backendTabToFactoryTab = (entry: BackendTabEntry): FactoryTab => ({
    id: entry.tabId,
    name: entry.name,
    factories: entry.data ?? [],
  })

  // Replaces all local tabs with the server's copy ("Use server data" / Force Download).
  const applyServerData = async () => {
    suppressSync.value = true
    try {
      const full = await syncActions.loadAllTabs()
      if (!full.tabs.length) {
        console.warn('applyServerData: Server has no tabs, nothing to apply.')
        return
      }

      clearQueues()
      appStore.setTabs(full.tabs.map(backendTabToFactoryTab))
      full.tabs.forEach(entry => setTabSyncMeta(entry.tabId, entry.lastSaved))

      await waitForLoaded()
      appStore.setLastSave()
      dataLastSaved.value = new Date()
      eventBus.emit('dataSynced')
    } finally {
      suppressSync.value = false
    }
  }

  // "Keep my local plans too": remote tabs win their slots, local tabs are appended as
  // separate tabs (renamed with a "(local)" suffix on name collisions), then pushed.
  const mergeServerData = async () => {
    let toPush: FactoryTab[] = []

    suppressSync.value = true
    try {
      const full = await syncActions.loadAllTabs()
      const remoteTabs = full.tabs.map(backendTabToFactoryTab)
      // Snapshot before setTabs replaces the array contents
      const localTabs = [...appStore.getTabs()]

      const merged = mergeTabs(localTabs, remoteTabs)
      clearQueues()
      appStore.setTabs(merged.tabs)
      full.tabs.forEach(entry => setTabSyncMeta(entry.tabId, entry.lastSaved))
      toPush = merged.toPush

      await waitForLoaded()
    } finally {
      suppressSync.value = false
    }

    const allTabs = appStore.getTabs()
    for (const tab of toPush) {
      const order = allTabs.findIndex((candidate: FactoryTab) => candidate.id === tab.id)
      const result = await syncActions.saveTab(tab, order)
      setTabSyncMeta(tab.id, result.lastSaved)
    }
    await syncActions.saveTabOrder(buildOrderPayload())

    appStore.setLastSave()
    dataLastSaved.value = new Date()
    eventBus.emit('dataSynced')
  }

  // Pushes every local tab to the server. Used when the account has no server data yet —
  // notably straight after registration.
  const pushAllTabs = async () => {
    const tabs = appStore.getTabs()
    for (const [index, tab] of tabs.entries()) {
      const result = await syncActions.saveTab(tab, index)
      setTabSyncMeta(tab.id, result.lastSaved)
    }
    await syncActions.saveTabOrder(buildOrderPayload())

    appStore.setLastSave()
    dataLastSaved.value = new Date()
    eventBus.emit('dataSynced')
  }

  // True when the server and this device are known to hold identical tab sets — same ids,
  // our recorded per-tab saves are current, and there are no local edits since the last
  // successful save/pull.
  const isAlreadyInSync = (remoteTabs: BackendTabEntry[]): boolean => {
    const localTabs = appStore.getTabs()
    if (remoteTabs.length !== localTabs.length) return false

    const localIds = new Set(localTabs.map((tab: FactoryTab) => tab.id))
    for (const remote of remoteTabs) {
      if (!localIds.has(remote.tabId)) return false
      const knownSave = tabSyncMeta.value[remote.tabId]
      if (!knownSave || new Date(knownSave) < new Date(remote.lastSaved)) return false
    }

    // Unsynced local edits?
    const lastEdit = appStore.getLastEdit()
    const lastSave = new Date(appStore.lastSave)
    return !(lastEdit > lastSave)
  }

  // Login (and registration, which auto-logs-in) decision tree.
  const handleLoggedInEvent = async () => {
    console.log('syncStore: Got logged in event, checking server data.')
    try {
      const meta = await syncActions.loadTabMeta()
      if (!meta) return // Invalid token, auth flow handles it

      const localTabs = appStore.getTabs()
      const localHasData = localTabs.length > 1 ||
        localTabs.some((tab: FactoryTab) => tab.factories.length > 0)

      // No server data at all: silently commit the local tabs (the registration path).
      if (!meta.tabs.length) {
        console.log('syncStore: Server has no tabs, silently pushing local tabs.')
        await pushAllTabs()
        return
      }

      // Local is a pristine fresh install: silently take the server copy.
      if (!localHasData) {
        console.log('syncStore: Local data is pristine, silently pulling server tabs.')
        await applyServerData()
        return
      }

      // Same device, nothing changed anywhere: no need to bother the user.
      if (isAlreadyInSync(meta.tabs)) {
        console.log('syncStore: Local and server data are already in sync.')
        return
      }

      // Both sides have data and they differ — the user must decide.
      eventBus.emit('dataMergeRequired')
    } catch (error) {
      console.error('syncStore: handleLoggedInEvent failed:', error)
      eventBus.emit('toast', {
        message: 'Could not check your plans against the server. Your local data is untouched — syncing will resume once the server is reachable.',
        type: 'error',
      })
    }
  }

  // ==== Event wiring
  const handleFactoryChange = () => {
    const currentTab = appStore.getCurrentTab()
    if (!currentTab) return
    queueTabSave(currentTab.id)
  }

  eventBus.on('factoryUpdated', handleFactoryChange)
  eventBus.on('buildingGroupUpdated', handleFactoryChange)
  eventBus.on('tabChanged', ({ tabId }: { tabId: string }) => {
    queueTabSave(tabId)
    queueOrderSync()
  })
  eventBus.on('tabRemoved', ({ tabId }: { tabId: string }) => queueTabDelete(tabId))
  eventBus.on('tabsReordered', () => queueOrderSync())
  eventBus.on('loggedIn', handleLoggedInEvent)

  // Switching tabs shortens the loss window: promote the switched-away tab's debounced save
  watch(() => appStore.currentFactoryTabIndex, () => flushPendingSaves())

  // Best-effort flush when the page hides or closes
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushPendingSaves)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPendingSaves()
    })
  }

  console.log('syncStore: Listening for changes...')

  return {
    dataLastSaved,
    syncPaused,
    suppressSync,
    inFlight,
    syncActions,
    tabSyncMeta,
    queueTabSave,
    queueTabDelete,
    queueOrderSync,
    flushPendingSaves,
    dispatch,
    retrySync,
    handleLoggedInEvent,
    applyServerData,
    mergeServerData,
    pushAllTabs,
    isAlreadyInSync,
  }
}

// The sync store must be a singleton: it registers eventBus listeners and owns the pending
// queues, so multiple instances would double-save. Tests pass overrides to get isolated
// instances with mocks injected.
let syncStoreInstance: ReturnType<typeof createSyncStore> | null = null

export const useSyncStore = (overrides?: SyncStoreOverrides) => {
  if (overrides) return createSyncStore(overrides)
  if (!syncStoreInstance) {
    syncStoreInstance = createSyncStore()
  }
  return syncStoreInstance
}
