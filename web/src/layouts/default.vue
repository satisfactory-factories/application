<template>
  <v-app>
    <template v-if="!hasError">
      <navigation>
        <template #append>
          <auth :button-color="authButtonColor" />
        </template>
      </navigation>

      <tab-navigation v-if="showTabNavigation" />
      <splash />
    </template>
    <v-main>
      <router-view />
      <toast />
      <hover-tooltip />
      <plan-repair-dialog v-if="!hasError" />
      <adoption-dialog v-if="!hasError" />
      <offline-prompt v-if="!hasError" />
      <version-prompt v-if="!hasError" />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
  import { onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import AdoptionDialog from '@/components/sync/AdoptionDialog.vue'
  import OfflinePrompt from '@/components/sync/OfflinePrompt.vue'
  import VersionPrompt from '@/components/sync/VersionPrompt.vue'
  import { useRoomsStore } from '@/stores/rooms-store'

  const { smAndDown } = useDisplay()
  const authButtonColor = computed(() => smAndDown.value ? 'grey-darken-3' : undefined)

  // Disable auth and other elements if an error is present as they will likely error themselves.
  const hasError = localStorage.getItem('error') ?? null
  const route = useRoute()

  const showTabNavigation = computed(() => {
    return route.path === '/' || route.path === '/graph'
  })

  // An anonymous joined tab has no membership on the server, so nothing in the
  // room list ever brings it back; this is the only thing that reconnects it.
  onMounted(() => {
    if (!hasError) useRoomsStore().restoreJoinedTabs()
  })
</script>
