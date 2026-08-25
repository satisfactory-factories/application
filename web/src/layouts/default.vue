<template>
  <v-app>
    <template v-if="!hasError">
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
    </template>
    <v-main>
      <router-view />
      <toast />
      <hover-tooltip />
      <plan-repair-dialog v-if="!hasError" />
      <!-- Mounted unconditionally: a client the API has refused needs telling even on a page
           that has errored. -->
      <update-required-dialog />
      <update-available-toast />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { startVersionCheck } from '@/utils/version-check'

  const { smAndDown } = useDisplay()
  const authButtonColor = computed(() => smAndDown.value ? 'grey-darken-3' : undefined)

  // Disable auth and other elements if an error is present as they will likely error themselves.
  const hasError = localStorage.getItem('error') ?? null
  const route = useRoute()

  const showTabNavigation = computed(() => {
    return route.path === '/' || route.path === '/graph'
  })

  // Started here rather than as an import side effect, so it has somewhere to be stopped.
  let stopVersionCheck: (() => void) | undefined
  onMounted(() => {
    stopVersionCheck = startVersionCheck()
  })
  onUnmounted(() => stopVersionCheck?.())
</script>
