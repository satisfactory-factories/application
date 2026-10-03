<template>
  <div v-if="health.unhealthy" class="backend-health" data-testid="backend-health-banner">
    <!-- The quick retries are still running, so the server may only be mid-deploy. Saying so beats
         sending everyone to Discord over an outage that will be gone in twenty seconds. -->
    <v-alert
      v-if="health.retrying"
      data-testid="backend-health-retrying"
      density="compact"
      type="warning"
      variant="flat"
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
    <v-alert v-else density="compact" type="error" variant="flat">
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
  import { HEALTH_RETRY_ATTEMPTS, useBackendHealthStore } from '@/stores/backend-health-store'

  /** The same invite the account tray and the introduction hand out. */
  const DISCORD_INVITE = 'https://discord.gg/vcFsjcWAFv'

  const health = useBackendHealthStore()
</script>

<style lang="scss" scoped>
// Placement is the bottom-notices stack in the default layout: this and the offline
// prompt can both be up at once, and two fixed banners on the same 8px would overlap.
.backend-health__link {
  color: inherit;
  font-weight: 700;
}
</style>
