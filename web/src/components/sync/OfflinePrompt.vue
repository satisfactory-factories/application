<template>
  <div v-if="prompting" class="offline-prompt" data-testid="offline-prompt">
    <v-alert density="compact" type="info" variant="flat">
      <div class="align-center d-flex flex-wrap ga-3 justify-space-between">
        <span>
          You appear to be offline. Your data will sync when you're back online.
          Go into offline mode?
        </span>
        <div class="d-flex ga-2">
          <v-btn
            color="black"
            data-testid="offline-accept"
            size="small"
            variant="flat"
            @click="roomSync.enterOffline()"
          >Go offline</v-btn>
          <v-btn
            data-testid="offline-decline"
            size="small"
            variant="text"
            @click="roomSync.dismissOfflinePrompt()"
          >Not now</v-btn>
        </div>
      </div>
    </v-alert>
  </div>

  <div v-else-if="roomSync.isOffline" class="offline-prompt" data-testid="offline-indicator">
    <v-alert density="compact" type="warning" variant="flat">
      <div class="align-center d-flex ga-3 justify-space-between">
        <span><i class="fas fa-plane mr-2" />Offline mode. Edits are kept on this device.</span>
        <v-btn
          color="black"
          data-testid="offline-exit"
          size="small"
          variant="flat"
          @click="roomSync.exitOffline()"
        >Go back online</v-btn>
      </div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoomSyncStore } from '@/stores/room-sync-store'

  // Never a dialog and never an alert(): the planner has to stay usable with no
  // network at all, which is the whole point of offline mode.
  const roomSync = useRoomSyncStore()

  const prompting = computed(() => roomSync.mode === 'offlinePrompt')
</script>

<style lang="scss" scoped>
.offline-prompt {
  bottom: 8px;
  left: 50%;
  max-width: 680px;
  position: fixed;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  z-index: 2400;
}
</style>
