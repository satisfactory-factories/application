<template>
  <v-app>
    <navigation>
      <template #append>
        <auth :button-color="authButtonColor" />
      </template>
    </navigation>

    <tab-navigation v-if="showTabNavigation" />
    <splash-v6 />
    <!-- The previous release's deck. Mounted for the whole session but only ever opened by
         hand, from the last slide of the one above. -->
    <splash />
    <v-main>
      <router-view />
      <toast />
      <hover-tooltip />
      <plan-repair-dialog />
      <!-- The login chooser first: adoption is parked until it is answered. -->
      <plan-chooser-dialog />
      <adoption-dialog />
      <!-- One stack, because more than one of these can be up at once. -->
      <div class="bottom-notices">
        <backend-health-banner />
        <offline-prompt />
      </div>
      <version-prompt />
      <update-required-dialog />
      <update-available-toast />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import AdoptionDialog from '@/components/sync/AdoptionDialog.vue'
  import BackendHealthBanner from '@/components/sync/BackendHealthBanner.vue'
  import PlanChooserDialog from '@/components/sync/PlanChooserDialog.vue'
  import OfflinePrompt from '@/components/sync/OfflinePrompt.vue'
  import VersionPrompt from '@/components/sync/VersionPrompt.vue'
  import { useBackendHealthStore } from '@/stores/backend-health-store'
  import { usePreferencesStore } from '@/stores/preferences-store'
  import { useRoomsStore } from '@/stores/rooms-store'
  import { useTelemetryStore } from '@/stores/telemetry-store'
  import { startVersionCheck } from '@/utils/version-check'

  const { smAndDown } = useDisplay()
  const authButtonColor = computed(() => smAndDown.value ? 'grey-darken-3' : undefined)

  const route = useRoute()

  // Instantiated here rather than by the account tile: its listeners are what start
  // preference sync, and they must not depend on which buttons happen to be rendered.
  usePreferencesStore()

  const showTabNavigation = computed(() => {
    return route.path === '/' || route.path === '/graph'
  })

  // Started here rather than as an import side effect, so it has somewhere to be stopped.
  let stopVersionCheck: (() => void) | undefined
  const backendHealth = useBackendHealthStore()
  const telemetry = useTelemetryStore()

  onMounted(() => {
    // An anonymous joined tab has no membership on the server, so nothing in the
    // room list ever brings it back; this is the only thing that reconnects it.
    useRoomsStore().restoreJoinedTabs()
    stopVersionCheck = startVersionCheck()
    backendHealth.start()
    telemetry.start()
  })
  onUnmounted(() => {
    stopVersionCheck?.()
    backendHealth.stop()
    telemetry.stop()
  })
</script>

<style lang="scss" scoped>
// The banners that live along the bottom edge. A column so two of them stack
// rather than covering each other, and only as tall as whatever is showing.
// Below 2000: Vuetify allocates overlays from there, and a select menu opened
// near the bottom of a short viewport must paint (and click) over a banner.
.bottom-notices {
  bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  left: 50%;
  max-width: 680px;
  position: fixed;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  z-index: 1900;
}
</style>
