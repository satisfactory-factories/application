<template>
  <div v-if="prompting" class="offline-prompt" data-testid="offline-prompt">
    <v-alert density="compact" type="info" variant="flat">
      <div class="align-center d-flex flex-wrap ga-3 justify-space-between">
        <span v-if="siteUp">
          Can't reach SF's servers right now. Your changes are kept in this browser and will sync
          when they're back. Go into offline mode?
        </span>
        <span v-else>
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
            @click="decline"
          >Not now</v-btn>
        </div>
      </div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useBackendHealthStore } from '@/stores/backend-health-store'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import { siteIsReachable } from '@/sync/connectivity-probe'
  import { declineOfflinePrompt, offlinePromptDeclined } from '@/sync/warning-dismissals'

  // Never a dialog and never an alert(): the planner has to stay usable with no
  // network at all, which is the whole point of offline mode. Being in offline mode
  // is said by the tab bar's chip and the account panel, so this is only the offer.
  const roomSync = useRoomSyncStore()
  const health = useBackendHealthStore()

  // A sync socket that keeps failing to reconnect is as likely to be SF's servers as the reader's
  // own connection, so before saying which, this checks whether the site's own host (served
  // separately from the API) still answers. Nothing shows until it has: the wrong reason is worse
  // than a second's wait.
  const siteUp = ref<boolean | null>(null)
  let probe = 0

  // Only while something is waiting to sync, like the backend-health banner: with nothing
  // pending, a dropped connection costs nothing yet. Not while the server is known to be down
  // either: that banner says so already, with its own way into offline mode, and two notices about
  // one outage is one too many. And "Not now" holds for the tab session, or a flapping connection
  // would bring it straight back.
  const wanted = computed(() =>
    roomSync.mode === 'offlinePrompt' &&
    roomSync.hasUnsyncedEdits &&
    !health.unhealthy &&
    !offlinePromptDeclined.value,
  )

  watch(wanted, async want => {
    const mine = ++probe
    siteUp.value = null
    if (!want) return
    const reachable = await siteIsReachable()
    // A newer question has been asked since: this answer is about a moment that has passed.
    if (mine === probe) siteUp.value = reachable
  }, { immediate: true })

  const prompting = computed(() => wanted.value && siteUp.value !== null)

  const decline = () => {
    declineOfflinePrompt()
    roomSync.dismissOfflinePrompt()
  }
</script>

<style lang="scss" scoped>
// Placement is the bottom-notices stack in the default layout, so this and the
// backend-health banner sit above one another rather than on top of one another.
</style>
