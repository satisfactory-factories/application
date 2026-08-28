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
      <div class="d-flex align-center tab-strip" style="min-width: 0">
        <v-tabs
          v-model="appStore.currentFactoryTabIndex"
        >
          <!--
            A plain wrapper inside the slide group's flex row, so the tabs stay its
            flex items and Vuetify's layout is untouched. Sortable only ever matches
            [data-draggable], which vuedraggable stamps on each item's root element,
            so the item here has to stay a single-root component (v-tab is one).
            `title` is not in vuedraggable's html-attribute allowlist and would be
            eaten as a Sortable option, hence component-data.
          -->
          <draggable
            :animation="150"
            class="d-flex h-100 tab-drag"
            :class="{ 'drag-enabled': !dragDisabled }"
            :component-data="{ title: orderIsFrozen ? DRAG_OFFLINE_HINT : undefined }"
            :disabled="dragDisabled"
            ghost-class="tab-ghost"
            item-key="id"
            :model-value="appStore.getTabs()"
            @change="onTabOrderChange"
          >
            <template #item="{ element: item, index }">
              <v-tab
                class="text-none"
                data-testid="factory-tab"
                :ripple="!isCurrentTab(index)"
                :slim="isCurrentTab(index)"
                :value="index"
              >
                <!--
                  FontAwesome swaps each <i> for an <svg> and detaches the element Vue
                  patches, so the icon has to be swapped by toggling a wrapper Vue owns.
                -->
                <span class="tab-state mr-2" :title="stateLabel(item.id)">
                  <span v-if="kindOf(item.id) === 'local'"><i class="fas fa-desktop" /></span>
                  <span v-else-if="kindOf(item.id) === 'collaborative'"><i class="fas fa-users" /></span>
                  <span v-else><i class="fas fa-user" /></span>
                  <!-- The server already sends the occupancy count; showing it costs nothing. -->
                  <span v-if="othersOn(item.id) > 0" class="ml-1" data-testid="tab-presence">
                    {{ othersOn(item.id) + 1 }}
                  </span>
                </span>
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
                  v-if="isCurrentTab(index) && canRename"
                  :key="`${isEditingName}`"
                  class="ml-2 tab-action"
                  :icon="`fas ${isEditingName ? 'fa-check': 'fa-pen'}`"
                  :loading="renaming"
                  size="x-small"
                  variant="text"
                  @click="onClickEditTabName"
                />
              </v-tab>
            </template>
          </draggable>
        </v-tabs>
        <!-- Kept a direct child of the strip: browser checks find it as `:scope > button.v-btn--icon`. -->
        <v-btn
          class="tab-action"
          data-testid="add-tab"
          icon="fas fa-plus"
          size="x-small"
          variant="text"
          @click="openNewTabChooser"
        />
        <!-- Advertises the local/synced choice exactly once per browser. -->
        <span v-if="showNudge" class="nudge-dot" data-testid="new-tab-nudge" />
      </div>
    </div>

    <div class="d-flex align-center h-100 ga-2 mr-1">
      <!-- Persistent while offline, and never in the way: the planner keeps working. -->
      <v-chip
        v-if="offlineHint"
        color="orange"
        data-testid="tab-bar-offline"
        size="small"
        :title="offlineHint.title"
        variant="flat"
      >
        <i class="fas fa-plane mr-2" />{{ offlineHint.label }}
      </v-chip>
      <v-btn
        v-if="kindOf(currentTabId) !== 'local'"
        color="grey-darken-1 rounded"
        icon="fas fa-copy"
        size="small"
        title="Duplicate as a local tab"
        variant="flat"
        @click="onClickDuplicate"
      />
      <ShareButton />
      <v-btn
        v-if="appStore.factoryTabs.length > 1"
        color="red rounded"
        icon="fas fa-trash"
        :loading="deleting"
        size="small"
        variant="flat"
        @click="onClickDelete"
      />
    </div>
  </div>

  <new-tab-dialog v-model="newTabChooserOpen" />
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import draggable from 'vuedraggable'
  import NewTabDialog from '@/components/sync/NewTabDialog.vue'
  import { useAppStore } from '@/stores/app-store'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import { useRoomsStore } from '@/stores/rooms-store'
  import { isCollaborative } from '@/sync/tab-sync-state'
  import { confirmDialog } from '@/utils/helpers'
  import eventBus from '@/utils/eventBus'

  /** Device-shaped, deliberately not synced: it is about this browser's user. */
  const NUDGE_KEY = 'newTabChooserSeen'

  /**
   * Offline mode makes no requests at all, and the room list is authoritative for
   * the synced tabs' order — so an order dragged offline would be silently undone
   * by the first refresh after coming back. Refusing the drag is the honest half.
   */
  const DRAG_OFFLINE_HINT = 'Tab order cannot be changed in offline mode.'

  const appStore = useAppStore()
  const roomsStore = useRoomsStore()
  const roomSync = useRoomSyncStore()

  const offlineHint = computed(() => {
    if (roomSync.isOffline) return { label: 'Offline mode', title: 'No contact with the server. Your edits are kept and sent when you go back online.' }
    if (roomSync.mode === 'offlinePrompt') return { label: 'Offline', title: 'The server cannot be reached right now. Edits are kept and sent when it can.' }
    return null
  })

  const isEditingName = ref(false)
  const currentTabName = ref(appStore.currentFactoryTab.name)
  const renaming = ref(false)
  const deleting = ref(false)
  const newTabChooserOpen = ref(false)
  const showNudge = ref(localStorage.getItem(NUDGE_KEY) !== 'true')

  const isCurrentTab = (index: number) => index === appStore.currentFactoryTabIndex
  const currentTabId = computed(() => appStore.currentFactoryTab?.id ?? '')

  const kindOf = (tabId: string): 'local' | 'synced' | 'collaborative' => {
    const state = appStore.getTabState(tabId)
    if (state.kind === 'local') return 'local'
    return isCollaborative(state) ? 'collaborative' : 'synced'
  }

  /** Everyone else in the room; zero for a tab nobody is sharing right now. */
  const othersOn = (tabId: string) => Math.max(0, (roomSync.rooms[tabId]?.presence ?? 0) - 1)

  const stateLabel = (tabId: string) => {
    const others = othersOn(tabId)
    switch (kindOf(tabId)) {
      case 'local': return 'Local tab: this browser only'
      case 'collaborative': return others > 0
        ? `Collaborative tab: shared and live, ${others} other person(s) here`
        : 'Collaborative tab: shared and live'
      default: return 'Synced tab: saved to your account'
    }
  }

  const canRename = computed(() => roomsStore.canRename(currentTabId.value))

  const syncedTabCount = computed(() =>
    appStore.getTabs().filter(tab => appStore.getTabState(tab.id).kind === 'synced').length)

  // Offline blocks exactly what offline would lose: a drag that changes the synced
  // tabs' order relative to each other. Everything else survives a refresh untouched.
  const orderIsFrozen = computed(() => roomSync.isSuppressed && syncedTabCount.value > 1)
  const dragDisabled = computed(() => appStore.getTabs().length < 2 || orderIsFrozen.value)

  const onTabOrderChange = async (event: { moved?: { newIndex: number, oldIndex: number } }) => {
    if (!event.moved) return

    const orderedIds = appStore.getTabs().map(tab => tab.id)
    const [tabId] = orderedIds.splice(event.moved.oldIndex, 1)
    orderedIds.splice(event.moved.newIndex, 0, tabId)

    const result = await roomsStore.reorderTabs(orderedIds)
    if (result !== true) {
      eventBus.emit('toast', { message: `Could not save the tab order: ${result}`, type: 'error' })
    }
  }

  const onClickEditTabName = async () => {
    if (!isEditingName.value) {
      isEditingName.value = true
      return
    }

    renaming.value = true
    const result = await roomsStore.renameTab(currentTabId.value, currentTabName.value)
    renaming.value = false
    isEditingName.value = false

    if (result !== true) {
      currentTabName.value = appStore.currentFactoryTab.name
      eventBus.emit('toast', { message: `Rename failed: ${result}`, type: 'error' })
    }
  }

  watch(() => appStore.currentFactoryTabIndex, () => {
    isEditingName.value = false
    currentTabName.value = appStore.currentFactoryTab.name
  })

  // A room rename from another device lands on the tab, so the edit field follows it.
  watch(() => appStore.currentFactoryTab?.name, name => {
    if (!isEditingName.value && name) currentTabName.value = name
  })

  const openNewTabChooser = () => {
    newTabChooserOpen.value = true
    if (!showNudge.value) return
    showNudge.value = false
    localStorage.setItem(NUDGE_KEY, 'true')
  }

  const onClickDuplicate = () => {
    if (roomsStore.duplicateAsLocal(currentTabId.value)) {
      eventBus.emit('toast', { message: 'Duplicated as a local tab.', type: 'success' })
    }
  }

  const deleteWarning = () => {
    const state = appStore.getTabState(currentTabId.value)
    if (state.kind === 'synced' && state.role === 'owner') {
      return state.shared
        ? 'This deletes the plan for everyone you shared it with. This action is irreversible!'
        : 'This deletes the plan from your account on every device. This action is irreversible!'
    }
    if (state.kind !== 'local') {
      return 'This removes the shared plan from your tabs. The owner keeps theirs.'
    }
    return 'Are you sure you wish to delete this tab? This action is irreversible!'
  }

  const onClickDelete = async () => {
    if (appStore.getFactories().length > 0 || kindOf(currentTabId.value) !== 'local') {
      if (!confirmDialog(deleteWarning())) return
    }

    deleting.value = true
    const result = await roomsStore.removeTab(currentTabId.value)
    deleting.value = false

    if (result !== true) {
      eventBus.emit('toast', { message: `Could not delete this tab: ${result}`, type: 'error' })
      return
    }
    await appStore.removeCurrentTab()
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
  // Fixed width sized to the wider label ("Show Sidebar") so toggling the text
  // doesn't nudge the tabs sideways.
  width: 152px;
}

// Bare glyphs rather than button pills: the text variant drops the fill, and
// the colour ties them to the consumption orange the selected tab uses.
.tab-action {
  color: var(--sf-power-consumption);
}

.tab-state {
  font-size: 0.8em;
  opacity: 0.75;
}

// The whole tab is the drag handle, so it is the tab that shows the affordance.
.tab-drag.drag-enabled :deep(.v-tab) {
  cursor: grab;
}

// Where the tab would land: dimmed rather than coloured, so the bar stays readable.
.tab-drag :deep(.tab-ghost) {
  background-color: rgba(255, 255, 255, 0.08);
  opacity: 0.5;
}

.tab-strip {
  position: relative;
}

// The add button is the strip's last child, so its top-right corner is the
// strip's — which keeps the dot on the button without wrapping it in anything.
.nudge-dot {
  background-color: var(--sf-power-consumption);
  border-radius: 50%;
  height: 8px;
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 4px;
  width: 8px;
}
</style>
