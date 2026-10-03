<template>
  <app-dialog
    v-model="isOpen"
    body-class="pt-2"
    body-max-height="55vh"
    close-title="Close icon picker"
    divider
    max-width="760"
    scrollable
  >
    <template #title>
      <factory-icon-display class="mr-3" :icon="factory.icon" size="36" />
      <span>Icon for "{{ factory.name }}"</span>
    </template>

    <template #header>
      <div class="px-4 pt-4">
        <v-text-field
          v-model="searchTerm"
          autofocus
          clearable
          density="compact"
          hide-details
          label="Search icons"
          prepend-inner-icon="fas fa-search"
          variant="outlined"
        />
      </div>

      <!-- Always visible, so the categories read as a map of what is in here rather than
           vanishing the moment you type. A query searches everything at once, so none of them
           is active while one is running; picking one clears the search. -->
      <div class="d-flex flex-wrap ga-2 px-4 pt-3">
        <v-chip
          v-for="option in tabs"
          :key="option.label"
          class="category-chip sf-chip-clickable"
          color="primary"
          size="small"
          :variant="!isSearching && tab === option.label ? 'flat' : 'outlined'"
          @click="selectCategory(option.label)"
        >
          {{ option.label }}
        </v-chip>
      </div>
    </template>

    <template v-if="isSearching">
      <p class="text-body-2 text-medium-emphasis mb-3">
        {{ searchResults.length }} {{ searchResults.length === 1 ? 'result' : 'results' }}
        for "{{ query }}"
      </p>
      <p v-if="!searchResults.length" class="text-body-2 text-medium-emphasis">
        No icons match your search.
      </p>
      <div class="icon-grid">
        <button
          v-for="entry in searchResults"
          :key="entry.id"
          class="icon-tile"
          :class="{ selected: entry.id === factory.icon }"
          :title="entry.name"
          type="button"
          @click="apply(entry.id)"
        >
          <factory-icon-display :icon="entry.id" size="32" />
        </button>
      </div>
    </template>

    <template v-else>
      <div v-for="group in groupedTabEntries" :key="group.label" class="mb-4">
        <!-- Only worth a heading when the tab holds more than one group: on the game tabs
             the single heading would just repeat the tab's own name. -->
        <p v-if="groupedTabEntries.length > 1" class="text-body-2 text-medium-emphasis mb-2">{{ group.label }}</p>
        <div class="icon-grid">
          <button
            v-for="entry in group.entries"
            :key="entry.id"
            class="icon-tile"
            :class="{ selected: entry.id === factory.icon }"
            :title="entry.name"
            type="button"
            @click="apply(entry.id)"
          >
            <factory-icon-display :icon="entry.id" size="32" />
          </button>
        </div>
      </div>
    </template>
    <template #actions>
      <v-btn
        :disabled="!factory.icon"
        prepend-icon="fas fa-industry"
        variant="text"
        @click="apply(undefined)"
      >Use default</v-btn>
      <v-spacer />
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import {
    factoryIcons,
    factoryIconSearchText,
    factoryIconTabs,
    groupFactoryIcons,
  } from '@/utils/factory-icons'
  import { fuzzySearch } from '@/utils/fuzzySearch'
  import FactoryIconDisplay from '@/components/planner/FactoryIconDisplay.vue'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{ factory: Factory }>()

  const isOpen = defineModel<boolean>({ required: true })

  const tabs = factoryIconTabs
  const defaultTab = tabs[0].label

  const tab = ref(defaultTab)
  const searchTerm = ref('')

  // Reopening should not land the user back in someone else's half-typed search.
  watch(isOpen, open => {
    if (!open) return
    searchTerm.value = ''
    tab.value = defaultTab
  })

  const query = computed(() => (searchTerm.value ?? '').trim())
  const isSearching = computed(() => query.value.length > 0)

  // Deliberately the whole registry, not the active tab: an icon the user cannot see the tab
  // for is exactly the one they are searching for.
  const searchResults = computed(() =>
    fuzzySearch(query.value, factoryIcons, factoryIconSearchText)
  )

  const groupedTabEntries = computed(() =>
    groupFactoryIcons(tabs.find(option => option.label === tab.value)?.entries ?? [])
  )

  // Picking a category is a way out of a search, not something to combine with it.
  const selectCategory = (label: string) => {
    searchTerm.value = ''
    tab.value = label
  }

  const apply = (id: string | undefined) => {
    props.factory.icon = id
    // Payload drives the local save and the sync flush; intent is what makes a rebase
    // carry the new icon over instead of discarding it.
    markFactoryEdited(props.factory)
    isOpen.value = false
  }
</script>

<style lang="scss" scoped>
.icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.icon-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 2px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;

  &:hover {
    background-color: rgba(255, 255, 255, 0.12);
  }

  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
  }

  &.selected {
    border-color: rgb(var(--v-theme-primary));
    background-color: rgba(var(--v-theme-primary), 0.16);
  }
}
</style>
