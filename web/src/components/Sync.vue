<template>
  <div class="my-4">
    <p>
      <i class="fas fa-plug" />
      <span class="ml-2 font-weight-bold">Connection:</span> {{ connectionLabel }}
    </p>
    <p v-if="syncedRooms.length" class="text-body-2 mt-1">
      {{ syncedRooms.length }} synced plan(s)
    </p>
  </div>

  <v-btn
    v-if="roomSyncStore.isOffline"
    color="primary"
    @click="roomSyncStore.exitOffline()"
  ><i class="fas fa-wifi mr-2" />Go back online</v-btn>
  <v-btn
    v-else
    color="orange"
    @click="roomSyncStore.enterOffline()"
  ><i class="fas fa-plane mr-2" />Offline mode</v-btn>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useRoomSyncStore } from '@/stores/room-sync-store'

  // The full account tile replaces this component; for now it is the smallest
  // honest window onto the sync engine's state.
  const roomSyncStore = useRoomSyncStore()

  const syncedRooms = computed(() =>
    Object.values(roomSyncStore.rooms).filter(room => room.status === 'synced')
  )

  const connectionLabel = computed(() => {
    switch (roomSyncStore.mode) {
      case 'offline': return 'Offline mode'
      case 'offlinePrompt': return 'You appear to be offline'
      case 'reconnecting': return 'Reconnecting...'
      default: return roomSyncStore.isConnected ? 'Connected' : 'Not connected'
    }
  })
</script>
