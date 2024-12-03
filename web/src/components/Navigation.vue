<template>
  <v-toolbar dark :density="toolbarDensity">
    <v-btn v-if="mdAndDown" icon @click="toggleDrawer">
      <i class="fa fa-bars" />
    </v-btn>
    <template v-else>
      <img alt="Site logo" src="/SF.png" style="max-width: 48px;">
      <h1 class="ml-3 font-weight-bold text-h6">Satisfactory Factories</h1>
      <span class="ml-2">
        <v-chip class="sf-chip blue small">v0.2 ALPHA</v-chip>
      </span>
    </template>
    <v-tabs
      v-model="currentTab"
    >
      <v-tab
        v-for="tab in tabItems"
        :key="tab.title"
        :prepend-icon="tab.icon"
        :text="tab.title"
        :to="tab.href"
        :value="tab.href"
      />
    </v-tabs>

    <template v-if="!mdAndDown">
      <ko-fi />
      <join-discord text="Discord" />
    </template>
    <template v-if="!mdAndDown" #append>
      <slot name="append" />
    </template>
  </v-toolbar>
  <v-navigation-drawer
    v-if="mdAndDown"
    v-model="isDrawerOpen"
    class="pa-2"
    width="300"
  >
    <div id="navigationDrawer" />
    <template #append>
      <div class="d-flex flex-column ga-2">
        <v-divider color="#ccc" thickness="2px" />
        <slot name="append" />
        <ko-fi />
        <join-discord text="Discord" />
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
  import { useDisplay } from 'vuetify'
  const { mdAndDown } = useDisplay()

  const toolbarDensity = computed(() => mdAndDown.value ? 'compact' : undefined)
  const isDrawerOpen = ref(false)
  const currentTab = ref(null)

  const toggleDrawer = () => {
    isDrawerOpen.value = !isDrawerOpen.value
  }

  const tabItems = [
    { title: 'Planner', icon: 'fas fa-ruler-triangle', href: '/' },
    { title: 'Graph (WIP)', icon: 'fas fa-project-diagram', href: '/graph' },
    { title: 'Recipes', icon: 'fas fa-hat-chef', href: '/recipes' },
  ]
</script>
