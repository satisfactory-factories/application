<template>
  <!-- No corner close: the dialog exists to get an answer, and dismissing it would leave the
       local and server plans still disagreeing with nothing to say so. -->
  <app-dialog
    v-model="showOOSDecisionDialog"
    :closable="false"
    icon="fas fa-sync"
    max-width="600"
    persistent
    title="Data out of sync!"
  >
    <p class="mb-4">Your local data and saved server data are out of sync. Please decide how to resolve this issue:</p>
    <v-btn class="mr-2" color="primary" @click="replaceRemoteData()">
      Use local data*
    </v-btn>
    <v-btn color="secondary" @click="handleDataLoad(true)">
      Use server data
    </v-btn>
    <p class="mt-4">*Recommended if you have made changes recently. Upon your next change to the plan, it will overwrite the server data.</p>
  </app-dialog>
  <div class="my-4">
    <p v-if="!syncing">
      <i class="fas fa-save" /><span class="ml-2 font-weight-bold">Last synced:</span> {{ lastSavedDisplay }}
    </p>
    <p v-else>
      <i class="fas fa-sync fa-spin" /><span class="ml-2 font-weight-bold">Syncing...</span>
    </p>
  </div>

  <v-btn
    color="orange"
    @click="confirmForceSync('This will delete your local data and pull it from the server. Continue?') && handleDataLoad(true)"
  ><i class="fas fa-download mr-2" />Force Download</v-btn>
  <v-btn
    v-if="isDebugMode"
    class="ml-2"
    color="secondary"
    @click="handleOutOfSyncEvent"
  ><i class="fas fa-bug mr-2" />Trigger OOS</v-btn>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { useSyncStore } from '@/stores/sync-store'
  import eventBus from '@/utils/eventBus'
  import { useAppStore } from '@/stores/app-store'

  const showOOSDecisionDialog = ref(false)
  const lastSavedDisplay = ref('Not saved yet, make a change!')
  const syncing = ref(false)

  const syncStore = useSyncStore()
  const { isDebugMode } = useAppStore()

  onMounted(() => {
    console.log('Sync: listening for sync events')
    eventBus.on('dataOutOfSync', handleOutOfSyncEvent)
    eventBus.on('dataSynced', () => {
      lastSavedDisplay.value = lastSaveDateFormat(new Date())
    })
  })

  // Handles loading of the data. If out of sync, the user will be prompted on what to do about it.
  const handleDataLoad = async (forceLoad = false) => {
    syncing.value = true
    const result = await syncStore.handleDataLoad(forceLoad)
    syncing.value = false

    if (result === 'oos') {
      showOOSDecisionDialog.value = true
    }

    if (result) {
      showOOSDecisionDialog.value = false
    }
  }

  const replaceRemoteData = async () => {
    syncing.value = true
    const result = await syncStore.handleSync(true)
    syncing.value = false
    if (result) {
      console.log('Sync: Replaced remote data with local data')
      lastSavedDisplay.value = lastSaveDateFormat(new Date())
      showOOSDecisionDialog.value = false
    }
  }

  const confirmForceSync = (message: string) => {
    return confirm(message)
  }

  const handleOutOfSyncEvent = () => {
    console.log('Sync: Received OOS event!')
    showOOSDecisionDialog.value = true
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
