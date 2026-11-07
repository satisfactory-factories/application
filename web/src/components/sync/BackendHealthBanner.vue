<template>
  <!-- Only while something is waiting to sync. With nothing pending, a server that has stopped
       answering costs the reader nothing yet, and a connection that flaps would otherwise bring
       this back every few minutes for no reason they could act on. -->
  <div v-if="showing" class="backend-health" data-testid="backend-health-banner">
    <!-- A known outage, already explained by the service notice: no "report it", no "an update
         is going out", just what is waiting and the way to stop hearing about it. -->
    <v-alert
      v-if="knownOutage"
      class="backend-health__warning"
      :color="sfColors.powerConsumption.color"
      data-testid="backend-health-known-outage"
      density="compact"
      type="warning"
      variant="flat"
      v-bind="closeProps"
      @click:close="dismissBackendWarning"
    >
      <div class="align-center d-flex flex-wrap ga-3 justify-space-between">
        <div class="backend-health__known-text">
          <div>SF's servers can't be reached right now, due to the ongoing connection issues.</div>
          <div class="text-caption">
            Your latest changes are kept in this browser and will sync once the server answers again.
          </div>
        </div>
        <v-btn
          color="black"
          data-testid="backend-health-go-offline"
          size="small"
          variant="flat"
          @click="roomSync.enterOffline()"
        >Go offline</v-btn>
      </div>
    </v-alert>
    <!-- The quick retries are still running, so the server may only be mid-deploy. Saying so beats
         sending everyone to Discord over an outage that will be gone in twenty seconds. -->
    <v-alert
      v-else-if="health.retrying"
      class="backend-health__warning"
      :color="sfColors.powerConsumption.color"
      data-testid="backend-health-retrying"
      density="compact"
      type="warning"
      variant="flat"
      v-bind="closeProps"
      @click:close="dismissBackendWarning"
    >
      <div>
        <v-progress-circular class="mr-2" indeterminate size="14" width="2" />
        Reconnecting to SF's backend servers, attempt {{ health.retryAttempt }} of
        {{ HEALTH_RETRY_ATTEMPTS }}.
      </div>
      <div class="text-caption">
        This usually means an update is going out. Keep planning: everything in your tabs is kept
        in this browser and will sync once the server answers again.
      </div>
    </v-alert>
    <v-alert
      v-else
      density="compact"
      type="error"
      variant="flat"
      v-bind="closeProps"
      @click:close="dismissBackendWarning"
    >
      <div>
        SF's backend is experiencing issues. Please report this immediately on
        <a
          class="backend-health__link"
          data-testid="backend-health-discord"
          :href="DISCORD_INVITE"
          rel="noopener"
          target="_blank"
        >Discord</a>.
      </div>
      <div class="text-caption">
        Signing in, sharing and syncing are unavailable until it is back. Everything in
        your tabs is kept in this browser and will sync once the server answers again. We are
        still checking periodically, and this will clear itself the moment the server is back.
      </div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { sfColors } from '@/utils/colors'
  import { SERVICE_NOTICE } from '@/config/service-notice'
  import type { ServiceNotice } from '@/config/service-notice'
  import { HEALTH_RETRY_ATTEMPTS, useBackendHealthStore } from '@/stores/backend-health-store'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import { backendWarningDismissed, dismissBackendWarning } from '@/sync/warning-dismissals'

  // A prop only so a spec can hand it a notice; the app mounts it bare and reads the config.
  const props = defineProps<{ notice?: ServiceNotice | null }>()
  const notice = computed(() => (props.notice === undefined ? SERVICE_NOTICE : props.notice))

  /** The same invite the account tray and the introduction hand out. */
  const DISCORD_INVITE = 'https://discord.gg/vcFsjcWAFv'

  const health = useBackendHealthStore()
  const roomSync = useRoomSyncStore()

  // Closable, and closed for the rest of the tab session: a flapping server would otherwise put
  // it straight back. The edits it was warning about are still kept, and still sync later.
  const closeProps = { closable: true, closeLabel: 'Hide this warning' }

  const showing = computed(() =>
    health.unhealthy && roomSync.hasUnsyncedEdits && !backendWarningDismissed.value,
  )
  const knownOutage = computed(() => notice.value?.kind === 'outage')
</script>

<style lang="scss" scoped>
// Placement is the bottom-notices stack in the default layout: this and the offline
// prompt can both be up at once, and two fixed banners on the same 8px would overlap.
// The sidebar toggle's orange with its dark text, rather than Vuetify's much brighter warning
// orange, which readers found glaring for something that can sit there a while.
.backend-health__warning {
  color: rgba(0, 0, 0, 0.87) !important;
}

.backend-health__known-text {
  // Takes the row, so the button sits beside the text and only drops below it on a phone.
  flex: 1 1 280px;
}

.backend-health__link {
  color: inherit;
  font-weight: 700;
}
</style>
