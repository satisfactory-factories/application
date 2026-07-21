<template>
  <div class="border-t-md d-flex tab-bar align-center justify-space-between w-100">
    <div class="d-flex align-center">
      <v-btn
        v-if="lgAndUp"
        class="mx-1 sidebar-toggle"
        prepend-icon="fas fa-bars"
        variant="flat"
        @click="toggleSidebar()"
      >{{ sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar' }}</v-btn>
      <div class="d-flex align-center" style="min-width: 0">
        <v-tabs
          v-model="appStore.currentFactoryTabIndex"
        >
          <v-tab
            v-for="(item, index) in appStore.getTabs()"
            :key="item.id"
            class="text-none"
            :ripple="!isCurrentTab(index)"
            :slim="isCurrentTab(index)"
            :value="index"
          >
            <input
              v-if="isCurrentTab(index) && isEditingName"
              v-model="currentTabName"
              class="pa-1 rounded border bg-grey-darken-2"
              @keyup.enter="onClickEditTabName"
            >
            <span v-else>
              {{ item.name }}
            </span>
            <v-btn
              v-if="isCurrentTab(index)"
              :key="`${isEditingName}`"
              class="ml-2 tab-action"
              :icon="`fas ${isEditingName ? 'fa-check': 'fa-pen'}`"
              size="x-small"
              variant="text"
              @click="onClickEditTabName"
            />
          </v-tab>
        </v-tabs>
        <v-btn
          class="tab-action"
          icon="fas fa-plus"
          size="x-small"
          variant="text"
          @click="appStore.addTab()"
        />
      </div>
    </div>

    <div class="d-flex align-center h-100 ga-2 mr-1">
      <ShareButton />
      <v-btn
        v-if="appStore.factoryTabs.length > 1"
        color="red rounded"
        icon="fas fa-trash"
        size="small"
        variant="flat"
        @click="confirmDelete() && appStore.removeCurrentTab()"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useDisplay } from 'vuetify'
  import { useAppStore } from '@/stores/app-store'
  import { confirmDialog } from '@/utils/helpers'
  import eventBus from '@/utils/eventBus'

  const appStore = useAppStore()

  const isEditingName = ref(false)
  const currentTabName = ref(appStore.currentFactoryTab.name)

  const isCurrentTab = (index:number) => index === appStore.currentFactoryTabIndex

  const onClickEditTabName = () => {
    isEditingName.value = !isEditingName.value
    if (!isEditingName.value) {
      appStore.currentFactoryTab.name = currentTabName.value
    }
  }

  watch(() => appStore.currentFactoryTabIndex, () => {
    isEditingName.value = false
    currentTabName.value = appStore.currentFactoryTab.name
  })

  const confirmDelete = () => {
    if (appStore.getFactories().length > 0) {
      return confirmDialog('Are you sure you wish to delete this tab? This action is irreversible!')
    }
    return true
  }

  const sidebarOpen = ref(localStorage.getItem('sidebarOpen') !== 'false')
  eventBus.on('sidebarChanged', (open: boolean) => {
    sidebarOpen.value = open
  })

  // Below the lg breakpoint there is no room for the docked sidebar — the
  // toolbar's burger icon drives the navigation drawer tray instead, so the
  // button only shows on desktop.
  const { lgAndUp } = useDisplay()

  const toggleSidebar = () => {
    eventBus.emit('toggleSidebar')
  }
</script>

<style scoped lang="scss">
// Darker than the grey-darken-3 the bar used to share with its buttons, so the
// bar reads as its own surface between the toolbar and content. The bottom
// border matches the sidebar's resize-handle divider (Planner.vue) so the bar's
// edge and the sidebar edge read as one continuous frame.
.tab-bar {
  background-color: #363636;
  border-bottom: 2px solid rgba(255, 255, 255, 0.12);
}

// The selected tab (text + underline slider, which inherits currentColor)
// shares the consumption orange from the semantic palette.
.v-tabs :deep(.v-tab--selected) {
  color: var(--sf-power-consumption);
}

// The slider doesn't inherit the tab's currentColor — its fill has to be set directly.
.v-tabs :deep(.v-tab__slider) {
  background-color: var(--sf-power-consumption);
}

.sidebar-toggle {
  background-color: var(--sf-power-consumption) !important;
  color: rgba(0, 0, 0, 0.87) !important;
}

// Bare glyphs rather than button pills: the text variant drops the fill, and
// the colour ties them to the consumption orange the selected tab uses.
.tab-action {
  color: var(--sf-power-consumption);
}
</style>
