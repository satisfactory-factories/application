<template>
  <v-dialog v-model="showOOSDecisionDialog" max-width="600" persistent>
    <v-card>
      <v-card-title class="text-h5">Data out of sync!</v-card-title>
      <v-card-text>
        <p class="mb-4">Your local data and saved server data are out of sync. Please decide how to resolve this issue:</p>
        <v-btn class="mr-2" color="primary" @click="replaceRemoteData()">
          Use local data*
        </v-btn>
        <v-btn color="secondary" @click="handleDataLoad(true)">
          Use server data
        </v-btn>
        <p class="mt-4 text-body-2">*Recommended if you have made changes recently. Upon your next change to the plan, it will overwrite the server data.</p>
      </v-card-text>

    </v-card>
  </v-dialog>
  <div class="my-4">
    <p v-if="!syncing">
      <i class="mdi mdi-content-save" /><span class="ml-2 font-weight-bold">Last synced:</span> {{ lastSavedDisplay }}
    </p>
    <p v-else>
      <i class="mdi mdi-sync mdi-spin" /><span class="ml-2 font-weight-bold">Syncing...</span>
    </p>
  </div>

  <v-btn
    color="orange"
    @click="confirmForceSync('This will delete your local data and pull it from the server. Continue?') && handleDataLoad(true)"
  ><i class="mdi mdi-download mr-2" />Force Download</v-btn>
  <v-btn
    v-if="isDebugMode"
    class="ml-2"
    color="secondary"
    @click="handleOutOfSyncEvent"
  ><i class="mdi mdi-bug mr-2" />Trigger OOS</v-btn>
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
