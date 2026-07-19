<template>
  <v-dialog v-model="showMergeDialog" max-width="600" persistent>
    <v-card>
      <v-card-title class="text-h5">Sync your plans</v-card-title>
      <v-card-text>
        <p class="mb-4">
          Your account has plans saved on the server, and this device has its own local plans.
          Your local data is about to be synced with the server copy — choose how to combine them:
        </p>
        <v-btn class="mr-2" color="primary" :disabled="syncing" @click="keepLocalPlans()">
          Keep my local plans too*
        </v-btn>
        <v-btn color="secondary" :disabled="syncing" @click="useServerData()">
          Use server data
        </v-btn>
        <p class="mt-4 text-body-2">
          *Recommended — nothing is lost. Your local plans are added as separate tabs alongside the
          server plans and saved to your account. If a local plan has the same name as a server plan,
          the local copy is renamed with a "(local)" suffix; the two are kept separate, not merged.
        </p>
        <p class="mt-2 text-body-2">
          "Use server data" replaces everything on this device with the server copy.
        </p>
      </v-card-text>
    </v-card>
  </v-dialog>
  <div class="my-4">
    <p v-if="!syncing">
      <i class="fas fa-save" /><span class="ml-2 font-weight-bold">Last synced:</span> {{ lastSavedDisplay }}
    </p>
    <p v-else>
      <i class="fas fa-sync fa-spin" /><span class="ml-2 font-weight-bold">Syncing...</span>
    </p>
    <p v-if="syncStore.syncPaused.value" class="mt-2 text-warning">
      <i class="fas fa-triangle-exclamation" /><span class="ml-2">Syncing is paused due to save failures.</span>
    </p>
  </div>

  <v-btn
    v-if="syncStore.syncPaused.value"
    class="mr-2"
    color="green"
    @click="syncStore.retrySync()"
  ><i class="fas fa-rotate-right mr-2" />Retry Sync</v-btn>
  <v-btn
    color="orange"
    @click="confirmForceSync('This will delete your local data and pull it from the server. Continue?') && useServerData()"
  ><i class="fas fa-download mr-2" />Force Download</v-btn>
  <v-btn
    v-if="isDebugMode"
    class="ml-2"
    color="secondary"
    @click="handleMergeRequiredEvent"
  ><i class="fas fa-bug mr-2" />Trigger Merge</v-btn>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { useSyncStore } from '@/stores/sync-store'
  import eventBus from '@/utils/eventBus'
  import { useAppStore } from '@/stores/app-store'

  const showMergeDialog = ref(false)
  const lastSavedDisplay = ref('Not saved yet, make a change!')
  const syncing = ref(false)

  const syncStore = useSyncStore()
  const { isDebugMode } = useAppStore()

  onMounted(() => {
    console.log('Sync: listening for sync events')
    eventBus.on('dataMergeRequired', handleMergeRequiredEvent)
    eventBus.on('dataSynced', () => {
      lastSavedDisplay.value = lastSaveDateFormat(new Date())
    })
  })

  // Replace everything local with the server copy
  const useServerData = async () => {
    syncing.value = true
    try {
      await syncStore.applyServerData()
      showMergeDialog.value = false
      lastSavedDisplay.value = lastSaveDateFormat(new Date())
    } catch (error) {
      console.error('Sync: useServerData failed:', error)
      eventBus.emit('toast', { message: 'Failed to load your data from the server. Your local data is untouched — please try again.', type: 'error' })
    } finally {
      syncing.value = false
    }
  }

  // Keep local plans: merge them in as separate tabs alongside the server data and push them
  const keepLocalPlans = async () => {
    syncing.value = true
    try {
      await syncStore.mergeServerData()
      showMergeDialog.value = false
      lastSavedDisplay.value = lastSaveDateFormat(new Date())
    } catch (error) {
      console.error('Sync: keepLocalPlans failed:', error)
      eventBus.emit('toast', { message: 'Failed to merge your plans with the server. Your local data is untouched — please try again.', type: 'error' })
    } finally {
      syncing.value = false
    }
  }

  const confirmForceSync = (message: string) => {
    return confirm(message)
  }

  const handleMergeRequiredEvent = () => {
    console.log('Sync: Received merge required event!')
    showMergeDialog.value = true
  }

  // Function to convert date object to desired format
  const lastSaveDateFormat = (date: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const day = String(date.getDate()).padStart(2, '0')
    const month = months[date.getMonth()]
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
  }
</script>
