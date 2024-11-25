import eventBus from '@/utils/eventBus'
import { ref } from 'vue'
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
      console.debug('syncStore: Not logged in. Skipping sync.')
      return
    }

    console.log('syncStore: Ticking...')
    if (stopSyncing.value) {
      console.warn('syncStore: Syncing is disabled.')
      return
    }

    if (!dataSavePending.value) {
      console.debug('syncStore: No data to save.')
      return
    }

    console.debug('syncStore: Syncing...')
    let result

    try {
      result = await syncActions.syncData(stopSyncing.value, dataSavePending.value)
    } catch (error) {
      if (error instanceof Error) {
        handleSyncError(error)
      }

      return handleSyncError(new Error('Unknown error occurred while saving data.'))
    }

    if (result) {
      dataSavePending.value = false
      dataLastSaved.value = new Date()
      localStorage.setItem('lastEdit', dataLastSaved.value.toISOString())
    } else {
      console.error('syncStore: No result for syncData!')
      handleSyncError(new Error('No result for syncData!'))
    }
  }

  const handleSyncError = (error: Error) => {
    console.error('syncData: Error:', error)
    stopSync()
    alert(`An error occurred while saving your data. Syncing has been disabled until page refresh in case of server outage. Please report this to Discord: ${error.message}`)
  }

  const handleDataLoad = (forceLoad = false) => {
    console.log('syncStore: Loading data...')
    return syncActions.loadServerData(forceLoad)
  }

  const handleSync = async () => {
    console.log('syncStore: Syncing...')
    return await syncActions.syncData(stopSyncing.value, dataSavePending.value)
  }

  const detectedChange = () => {
    console.log('syncStore: Detected change in data.')
    dataSavePending.value = true
  }

  const stopSync = () => {
    clearInterval(syncInterval)
    stopSyncing.value = true
  }

  eventBus.on('factoryUpdated', detectedChange)
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
