<template>
  <v-dialog max-width="600" :v-model="!showOverwriteDialog">
    <v-card>
      <v-card-title class="headline">Data out of sync!</v-card-title>
      <v-card-text>
        <p class="mb-4">Your local data and saved server data are out of sync. Please decide how to resolve this issue:</p>
        <v-btn color="primary" @click="handleDataLoad(true)">
          Use server data
        </v-btn>
        <v-btn color="secondary" @click="replaceRemoteData()">
          Use local data
        </v-btn>
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

  </div>

  <v-btn
    color="primary"
    @click="confirmForceSync('This will delete your local data and pull it from the server. Continue?') && handleDataLoad(true)"
  >Force Download</v-btn>

  <div v-show="syncing">
    <p class="text-body-1">
      <i class="fas fa-sync fa-spin" /><span class="ml-2">Syncing...
      </span>
    </p>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { useSyncStore } from '@/stores/sync-store'

  const showOverwriteDialog = ref(false)
  const lastSavedDisplay = ref('Not saved yet, make a change!')
  const syncing = ref(false)

  const syncStore = useSyncStore()

  // Handles loading of the data. If out of sync, the user will be prompted on what to do about it.
  const handleDataLoad = async (forceLoad = false) => {
    syncing.value = true
    const result = await syncStore.handleDataLoad(forceLoad)
    syncing.value = false

    if (result === 'oos') {
      showOverwriteDialog.value = true
    }
  }

  const replaceRemoteData = async () => {
    syncing.value = true
    const result = await syncStore.handleSync()
    syncing.value = false
    if (result) {
      lastSavedDisplay.value = lastSaveDateFormat(new Date())
    }
  }

  const confirmForceSync = (message: string) => {
    return confirm(message)
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
