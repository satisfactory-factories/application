<template>
  <div v-if="showing" class="offline-return-prompt" data-testid="offline-return-prompt">
    <v-alert density="compact" type="info" variant="flat">
      <div class="align-center d-flex flex-wrap ga-3 justify-space-between">
        <span>
          You're still in offline mode, so nothing is being synced. Go back online?
        </span>
        <div class="d-flex ga-2">
          <v-btn
            color="black"
            data-testid="offline-return-accept"
            size="small"
            variant="flat"
            @click="goOnline"
          >Go online</v-btn>
          <v-btn
            data-testid="offline-return-decline"
            size="small"
            variant="text"
            @click="close"
          >Stay offline</v-btn>
        </div>
      </div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import {
    OFFLINE_RETURN_PROMPT_MS,
    rememberOfferedReturn,
    shouldOfferReturn,
  } from '@/sync/offline-mode'

  // Offline mode now survives a reload, so a page can open silent long after the connection
  // trouble that prompted it has passed. This is the one reminder, once per tab session, with
  // the way out on it. Never a dialog: staying offline is a fine answer and costs nothing.
  const roomSync = useRoomSyncStore()

  const showing = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const close = () => {
    showing.value = false
    clearTimeout(timer)
    timer = undefined
  }

  const goOnline = () => {
    close()
    roomSync.exitOffline()
  }

  onMounted(() => {
    if (!shouldOfferReturn(roomSync.restoredOffline, roomSync.isOffline)) return
    rememberOfferedReturn()
    showing.value = true
    timer = setTimeout(close, OFFLINE_RETURN_PROMPT_MS)
  })

  // Turned off another way, from the account panel say: the question has been answered.
  watch(() => roomSync.isOffline, offline => {
    if (!offline) close()
  })

  onBeforeUnmount(() => clearTimeout(timer))
</script>

<style lang="scss" scoped>
// Placement is the bottom-notices stack in the default layout, alongside the other offline
// prompt and the backend-health banner.
</style>
