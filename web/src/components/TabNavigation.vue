<template>
  <div>
    <div class="border-t-md d-flex bg-grey-darken-3 align-center justify-space-between w-100">
      <div class="d-flex align-center" style="min-width: 0">
        <v-tabs
          v-model="appStore.currentFactoryTabIndex"
          color="deep-orange"
        >
          <v-tab
            v-for="(item, index) in appStore.factoryTabs"
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
          @click="appStore.addTab()"
        />
      </div>

      <div class="d-flex align-center h-100 ga-2 mr-1">
        <ShareButton />
        <v-btn
          v-if="appStore.factoryTabs.length > 1"
          color="red rounded"
          icon="fas fa-trash"
          size="small"
          variant="flat"
          @click="appStore.removeCurrentTab()"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useAppStore } from '@/stores/app-store'

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
</script>
