<template>
  <div v-if="health.unhealthy" class="backend-health" data-testid="backend-health-banner">
    <v-alert density="compact" type="error" variant="flat">
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
        your tabs is kept in this browser and will sync once the server answers again.
      </div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
  import { useBackendHealthStore } from '@/stores/backend-health-store'

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
