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
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'

  const { smAndDown } = useDisplay()
  const authButtonColor = computed(() => smAndDown.value ? 'grey-darken-3' : undefined)

  // Disable auth and other elements if an error is present as they will likely error themselves.
  const hasError = localStorage.getItem('error') ?? null
  const route = useRoute()

  const showTabNavigation = computed(() => {
    return route.path === '/' || route.path === '/graph'
  })
</script>
