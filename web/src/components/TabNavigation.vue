<template>
  <div>
    <div class="border-t-md d-flex bg-grey-darken-3 align-center justify-space-between w-100">
      <div class="d-flex align-center" style="min-width: 0">
        <v-tabs
          v-model="selectedTab"
          color="deep-orange"
        >
          <v-tab
            v-for="(tab) in appStore.getTabs()"
            :key="tab.id"
            class="text-none"
            :ripple="!isCurrentTab(tab)"
            :slim="isCurrentTab(tab)"
            :value="tab.id"
          >
            <input
              v-if="isCurrentTab(tab) && isEditingName"
              v-model="currentTabName"
              class="pa-1 rounded border bg-grey-darken-2"
              @keyup.enter="onClickEditTabName"
            >
            <span v-else>
              {{ tab.name }}
            </span>
            <v-btn
              v-if="isCurrentTab(tab)"
              :key="`${isEditingName}`"
              color="grey-darken-3"
              :icon="`fas ${isEditingName ? 'fa-check': 'fa-pen'}`"
              size="x-small"
              variant="flat"
              @click="onClickEditTabName"
            />
          </v-tab>
        </v-tabs>
        <v-btn
          color="grey-darken-3"
          icon="fas fa-plus"
          size="x-small"
          variant="flat"
          @click="appStore.createNewTab()"
        />
      </div>

      <div class="d-flex align-center h-100 ga-2 mr-1">
        <ShareButton />
        <v-btn
          v-if="getTabsCount(appStore.getState())"
          color="red rounded"
          icon="fas fa-trash"
          size="small"
          variant="flat"
          @click="confirmDelete() && appStore.removeCurrentTab()"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useAppStore } from '@/stores/app-store'
  import { confirmDialog } from '@/utils/helpers'
  import { FactoryTab } from '@/interfaces/planner/FactoryInterface'
  import eventBus from '@/utils/eventBus'
  import { getTabsCount } from '@/utils/plannerStateManagement'

  const appStore = useAppStore()

  // Take a shallow copy of the current tab ID
  const selectedTab = ref(JSON.parse(JSON.stringify(appStore.currentTabId)))

  const isEditingName = ref(false)
  const currentTabName = ref(appStore.currentTab().name)

  const isCurrentTab = (tab: FactoryTab) => tab.id === appStore.currentTabId

  const onClickEditTabName = () => {
    isEditingName.value = !isEditingName.value
    if (!isEditingName.value) {
      appStore.currentTab().name = currentTabName.value
    }
  }

  watch(() => appStore.currentTabId, () => {
    isEditingName.value = false
    currentTabName.value = appStore.currentTab().name
  })

  watch(() => selectedTab.value, () => {
    console.log('TabNavigation: selectedTab: Changing selected tab:', selectedTab.value)
    appStore.changeCurrentTab(selectedTab.value)
  })

  eventBus.on('switchTab', (tabId: string) => {
    selectedTab.value = tabId
  })

  const confirmDelete = () => {
    if (appStore.getFactories().length > 0) {
      return confirmDialog('Are you sure you wish to delete this tab? This action is irreversible!')
    }
    return true
  }
</script>
