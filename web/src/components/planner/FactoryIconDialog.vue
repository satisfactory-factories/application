<template>
  <v-dialog v-model="isOpen" max-width="760" scrollable>
    <v-card>
      <v-card-title class="text-h6 py-4 d-flex align-center">
        <factory-icon-display class="mr-3" :icon="factory.icon" size="28" />
        <span>Icon for "{{ factory.name }}"</span>
      </v-card-title>
      <v-divider />

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

      <!-- Tabs are for browsing. A query searches the whole registry at once, so they would
           only hide matches — they give way to a single flat grid until it is cleared. -->
      <v-tabs v-if="!isSearching" v-model="tab" class="px-2" density="compact">
        <v-tab v-for="option in tabs" :key="option.value" :value="option.value">
          {{ option.label }}
        </v-tab>
      </v-tabs>

      <v-card-text class="pt-2" style="max-height: 55vh;">
        <template v-if="isSearching">
          <p class="text-body-2 text-medium-emphasis mb-3">
            {{ searchResults.length }} {{ searchResults.length === 1 ? 'result' : 'results' }}
            for "{{ debouncedSearchTerm }}"
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
          <div v-for="group in groupedTabEntries" :key="group.name" class="mb-4">
            <p class="text-body-2 text-medium-emphasis mb-2">{{ group.name }}</p>
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
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <v-btn
          :disabled="!factory.icon"
          prepend-icon="fas fa-industry"
          variant="text"
          @click="apply(undefined)"
        >Use default</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import {
    emojiFactoryIcons,
    type FactoryIconEntry,
    factoryIcons,
    factoryIconSearchText,
    gameFactoryIcons,
    popularFactoryIcons,
  } from '@/utils/factory-icons'
  import { fuzzySearch } from '@/utils/fuzzySearch'
  import FactoryIconDisplay from '@/components/planner/FactoryIconDisplay.vue'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{ factory: Factory }>()

  const isOpen = defineModel<boolean>({ required: true })

  const tabs = [
    { value: 'popular', label: 'Popular', entries: popularFactoryIcons },
    { value: 'game', label: 'All icons', entries: gameFactoryIcons },
    { value: 'emoji', label: 'Emoji', entries: emojiFactoryIcons },
  ]

  const tab = ref('popular')
  const searchTerm = ref('')

  // Same debounce as the parts browser: ~280 tiles should not re-filter on every keystroke.
  const debouncedSearchTerm = ref('')
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  watch(searchTerm, value => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedSearchTerm.value = (value ?? '').trim()
    }, 250)
  })

  // Reopening should not land the user back in someone else's half-typed search.
  watch(isOpen, open => {
    if (!open) return
    clearTimeout(debounceTimer)
    searchTerm.value = ''
    debouncedSearchTerm.value = ''
    tab.value = 'popular'
  })

  const isSearching = computed(() => debouncedSearchTerm.value.length > 0)

  // Deliberately the whole registry, not the active tab: an icon the user cannot see the tab
  // for is exactly the one they are searching for.
  const searchResults = computed(() =>
    fuzzySearch(debouncedSearchTerm.value, factoryIcons, factoryIconSearchText)
  )

  const groupedTabEntries = computed(() => {
    const entries = tabs.find(option => option.value === tab.value)?.entries ?? []
    const groups: { name: string, entries: FactoryIconEntry[] }[] = []

    entries.forEach(entry => {
      const group = groups.find(candidate => candidate.name === entry.group)
      if (group) {
        group.entries.push(entry)
      } else {
        groups.push({ name: entry.group, entries: [entry] })
      }
    })

    return groups
  })

  const apply = (id: string | undefined) => {
    props.factory.icon = id
    // Drives both the local save (app-store schedulePersist) and the cloud sync dirty flag
    // (sync-store detectedChange) — same route PlannerFactoryNotes uses for the notes field.
    eventBus.emit('factoryUpdated', props.factory)
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
