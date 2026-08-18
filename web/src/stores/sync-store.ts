import eventBus from '@/utils/eventBus'
import { ref } from 'vue'
import { ClientTooOldError } from '@/errors/ClientTooOldError'
import { announceClientOutdated } from '@/utils/api'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { SyncActions } from '@/stores/sync/sync-actions'

// Overrides used for dependency injecting mocks into the store when under test.
interface SyncStoreOverrides {
  authStore?: any
  appStore?: any
  syncActions?: any
}

export const useSyncStore = (overrides?: SyncStoreOverrides) => {
  const dataSavePending = ref<boolean>(false)
  const dataLastSaved = ref<Date | null>(null)
  const stopSyncing = ref<boolean>(false)
  let syncInterval: NodeJS.Timeout

  const authStore = overrides?.authStore ?? useAuthStore()
  const appStore = overrides?.appStore ?? useAppStore()
  const syncActions = overrides?.syncActions ?? new SyncActions(authStore, appStore)

  const setupTick = () => {
    clearInterval(syncInterval) // Prevents double-clocking
    syncInterval = setInterval(async () => {
      await tickSync()
    }, 10000)
    console.log('syncStore: Tick setup')
  }

  const tickSync = async () => {
    const isLoggedIn = authStore.getLoggedInUser()
    if (!isLoggedIn) {
      return
    }

    if (stopSyncing.value) {
      return
    }

    if (!dataSavePending.value) {
      return
    }

    let result

    try {
      result = await syncActions.syncData(stopSyncing.value, dataSavePending.value)
    } catch (error) {
      if (error instanceof ClientTooOldError) {
        return handleClientTooOld(error)
      }
      if (error instanceof Error) {
        return handleSyncError(error)
      }

      return handleSyncError(new Error('Unknown error occurred while saving data.'))
    }

    if (result) {
      dataSavePending.value = false
      dataLastSaved.value = new Date()
      localStorage.setItem('lastEdit', dataLastSaved.value.toISOString())
      eventBus.emit('dataSynced')
    } else {
      console.error('syncStore: No result for syncData!')
      handleSyncError(new Error('No result for syncData!'))
    }
  }

  // A refused write, not a failed one. No alert: the outage message tells people to report to
  // Discord, and a required reload is not something anyone needs to report. Local data is left
  // exactly as it is — it lives in localStorage and is the only copy of the user's work here.
  const handleClientTooOld = (error: ClientTooOldError) => {
    console.warn('syncStore: This client is too old to save. Syncing stopped until reload.', error.minimumVersion)
    stopSync()
    announceClientOutdated(error.minimumVersion)
  }

  const handleSyncError = (error: Error) => {
    console.error('syncData: Error:', error)
    stopSync()
    alert(`An error occurred while saving your data. Syncing has been disabled until page refresh in case of server outage. Please report this to Discord: ${error.message}`)
  }

  const handleDataLoad = async (forceLoad = false): Promise<void | 'oos'> => {
    console.log('syncStore: Loading data...')
    const result = await syncActions.loadServerData(forceLoad)
    if (result === 'oos') {
      eventBus.emit('dataOutOfSync')
    }

    return result
  }

  const handleSync = async (force = false) => {
    console.log('syncStore - handleSync: Syncing...')

    try {
      if (force) {
        console.log('syncStore - handleSync: Forcing sync...')
        return await syncActions.syncData(false, true)
      }
      return await syncActions.syncData(stopSyncing.value, dataSavePending.value)
    } catch (error) {
      // Forcing a sync must not bypass the gate either, and the caller has no handling for it.
      if (error instanceof ClientTooOldError) {
        handleClientTooOld(error)
        return false
      }
      throw error
    }
  }

  // Only a user's own edit dirties the account copy. A plan still loading is emitting the
  // migration recalculation, not a change anyone asked for — and uploading that would replace
  // the stored plan with a migrated one before the user has seen the notice, run the wizard or
  // taken a backup. `isLoaded` flips in loadingCompleted, after the migration has settled.
  const detectedChange = () => {
    if (!appStore.isLoaded) {
      return
    }
    dataSavePending.value = true
  }

  const stopSync = () => {
    clearInterval(syncInterval)
    stopSyncing.value = true
  }

  const handleLoggedInEvent = async () => {
    console.log('Got logged in event, requesting data load')

    // If the user has no factory data, assume we want to force a load
    if (!appStore.getFactories().length) {
      await handleDataLoad(true)
      return
    }

    await handleDataLoad()
  }

  // Reads report a stale client too, so this can arrive without a write ever being attempted.
  const handleClientOutdatedEvent = () => {
    if (!stopSyncing.value) {
      console.warn('syncStore: Client reported as outdated by the API, stopping sync.')
      stopSync()
    }
  }

  eventBus.on('clientOutdated', handleClientOutdatedEvent)
  eventBus.on('factoryUpdated', detectedChange)
  // Plan-level edits change what gets uploaded now that the whole tab is sent, so they have to
  // mark the account copy dirty as well.
  eventBus.on('planUpdated', detectedChange)
  eventBus.on('loggedIn', handleLoggedInEvent)
  console.log('syncStore: Listening for changes...')

  return {
    dataSavePending,
    dataLastSaved,
    stopSyncing,
    syncActions,
    handleDataLoad,
    handleSync,
    setupTick,
    tickSync,
    detectedChange,
    stopSync,
  }
}
