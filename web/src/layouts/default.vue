<template>
  <v-app>
    <navigation v-if="!hasError" @click="closeAuthTray" />
    <auth v-if="!hasError" ref="authRef" />
    <tab-navigation v-if="showTabNavigation && !hasError" />
    <v-main @click="closeAuthTray">
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
  import { useRoute } from 'vue-router'

  // Disable auth and other elements if an error is present as they will likely error themselves.
  const hasError = localStorage.getItem('error') ?? null
  const route = useRoute()

  const showTabNavigation = computed(() => {
    return route.path === '/' || route.path === '/graph'
  })

  const authRef = ref(null)

  const closeAuthTray = () => {
    if (authRef.value) {
      // @ts-ignore
      authRef.value.closeTray()
    }
  }
</script>
