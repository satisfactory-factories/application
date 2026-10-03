<template>
  <div v-if="visible" class="version-prompt" data-testid="version-prompt">
    <v-alert density="compact" type="warning" variant="flat">
      <div class="align-center d-flex ga-4 justify-space-between">
        <span>A new version is available. Refresh to continue syncing.</span>
        <v-btn
          color="black"
          data-testid="version-refresh"
          size="small"
          variant="flat"
          @click="refresh"
        >
          <i class="fas fa-sync mr-2" />Refresh
        </v-btn>
      </div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import eventBus from '@/utils/eventBus'

  // Deliberately has no dismiss: nothing this client sends will be accepted again
  // until it reloads. It stays out of the way rather than blocking the planner.
  const roomSync = useRoomSyncStore()
  const visible = ref(roomSync.connection === 'version_mismatch')

  const show = () => {
    visible.value = true
  }

  eventBus.on('versionMismatch', show)

  const stop = watch(() => roomSync.connection, status => {
    if (status === 'version_mismatch') show()
  })

  const refresh = () => window.location.reload()

  onBeforeUnmount(() => {
    eventBus.off('versionMismatch', show)
    stop()
  })
</script>

<style lang="scss" scoped>
// Above Vuetify's overlays so a dialog cannot hide it, but it never takes the
// pointer: the planner stays usable while the tab is out of date.
.version-prompt {
  left: 50%;
  max-width: 640px;
  position: fixed;
  top: 8px;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  z-index: 2500;
}
</style>
