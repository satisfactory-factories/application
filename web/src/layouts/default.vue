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
      <adoption-dialog />
      <offline-prompt />
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
  import OfflinePrompt from '@/components/sync/OfflinePrompt.vue'
  import VersionPrompt from '@/components/sync/VersionPrompt.vue'
  import { usePreferencesStore } from '@/stores/preferences-store'
  import { useRoomsStore } from '@/stores/rooms-store'
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

  onMounted(() => {
    // An anonymous joined tab has no membership on the server, so nothing in the
    // room list ever brings it back; this is the only thing that reconnects it.
    useRoomsStore().restoreJoinedTabs()
    stopVersionCheck = startVersionCheck()
  })
  onUnmounted(() => stopVersionCheck?.())
</script>
