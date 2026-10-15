<template>
  <app-dialog
    v-model="isOpen"
    body-class="pa-0"
    body-max-height="60vh"
    divider
    icon="fas fa-dolly"
    max-width="640"
    scrollable
    :title="editing ? 'Change import' : 'Add import'"
  >
    <template #header>
      <div class="px-4 pt-2 pb-3">
        <v-switch
          color="primary"
          data-testid="import-filter-demand"
          density="compact"
          :disabled="!anyNeeded"
          hide-details
          label="Filter by demand: only items this factory uses"
          :model-value="filterByDemand"
          @update:model-value="setFilterByDemand"
        />
        <p class="demand-caption text-caption text-medium-emphasis mb-3">
          Turn this off to import any item another factory has spare, even one this factory does not
          use. That is how a factory becomes a logistics hub, gathering items to pass on to others.
        </p>
        <v-autocomplete
          v-model="selectedPart"
          auto-select-first
          data-testid="import-item-picker"
          hide-details
          :items="partItems"
          label="Item to import"
          variant="outlined"
        >
          <template #prepend-inner>
            <game-asset
              v-if="selectedPart"
              :key="selectedPart"
              height="28px"
              :subject="selectedPart"
              type="item"
              width="28px"
            />
          </template>
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :data-need="item.need ?? undefined">
              <template #prepend>
                <game-asset
                  class="mr-2"
                  height="28px"
                  :subject="item.value"
                  type="item"
                  width="28px"
                />
              </template>
              <template v-if="item.need" #subtitle>
                <span :class="needCaptions[item.need].class" data-testid="import-item-need">
                  {{ needCaptions[item.need].text }}
                </span>
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>
      </div>
    </template>

    <p v-if="partItems.length === 0" class="text-body-2 text-medium-emphasis pa-4">
      No other factory in the plan has anything spare to import.
    </p>
    <p v-else-if="!selectedPart" class="text-body-2 text-medium-emphasis pa-4">
      Pick an item to see every factory with some of it spare.
    </p>
    <v-list v-else-if="sources.length">
      <v-list-item
        v-for="source in sources"
        :key="source.factory.id"
        :class="`import-source-${source.factory.id}`"
        :data-source-name="source.factory.name"
        data-testid="import-source"
        :disabled="unavailable(source)"
      >
        <template #prepend>
          <factory-icon-display class="mr-3" :icon="source.factory.icon" size="32" />
        </template>
        <v-list-item-title class="d-flex align-center flex-wrap ga-2">
          <span>{{ source.factory.name }}</span>
          <span v-if="source.via.length" class="text-medium-emphasis">(via {{ source.via.join(', ') }})</span>
          <v-chip v-if="source.via.length" class="sf-chip blue x-small">
            <i class="fas fa-random mr-1" />Hub
          </v-chip>
          <v-chip v-if="source.alreadyImported" class="sf-chip x-small">
            Already imported
          </v-chip>
        </v-list-item-title>
        <v-list-item-subtitle>
          <span v-if="source.loop" class="text-red" data-testid="import-source-loop">
            Unable to import: Will create loop
          </span>
          <span v-else :class="source.spare > 0 ? 'text-green' : 'text-red'">
            {{ formatNumber(source.spare) }}/min spare
          </span>
        </v-list-item-subtitle>
        <template #append>
          <v-btn
            color="primary"
            :disabled="unavailable(source)"
            size="small"
            :title="`Import ${partName} from ${source.factory.name}`"
            variant="tonal"
            @click="choose(source)"
          >
            <i class="fas fa-plus" /><span class="ml-1">{{ source.factory.id === currentFactoryId ? 'Keep' : 'Import' }}</span>
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
    <p v-else class="text-body-2 text-medium-emphasis pa-4">
      No factory has {{ partName }} spare.
    </p>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useAppStore } from '@/stores/app-store'
  import {
    getImportableParts,
    getImportNeed,
    getImportSources,
    ImportNeed,
    ImportSource,
  } from '@/utils/factory-management/redistribution'

  const props = defineProps<{
    factory: Factory
    // The row being re-pointed, or null when adding a new import.
    inputIndex: number | null
  }>()

  const emit = defineEmits<{
    (e: 'select', payload: { factoryId: number, part: string, spare: number }): void
  }>()

  const isOpen = defineModel<boolean>({ required: true })

  const { getFactories } = useAppStore()

  const editing = computed(() => props.inputIndex !== null)
  const currentInput = computed(() =>
    props.inputIndex === null ? null : props.factory.inputs[props.inputIndex] ?? null
  )
  const currentFactoryId = computed(() => currentInput.value?.factoryId ?? null)

  const selectedPart = ref<string | null>(null)

  // Every surplus in the plan, with what this factory needs listed first. "Filter by demand" cuts
  // the list down to just the needed ones. The switch is remembered in this browser, so the dialog
  // opens the way it was last left (on until first turned off). It still opens off for a hub or a
  // row being re-pointed to an item it does not use, which would otherwise open on an empty or
  // incomplete list (the #46 tester reports); that override is not saved over the preference.
  const FILTER_STORAGE_KEY = 'importFilterByDemand'
  const filterByDemand = ref(false)

  const savedFilterPreference = (): boolean => {
    try {
      return localStorage.getItem(FILTER_STORAGE_KEY) !== 'false'
    } catch {
      return true
    }
  }

  const setFilterByDemand = (value: boolean | null) => {
    filterByDemand.value = !!value
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, String(!!value))
    } catch {
      // Storage blocked or full: the switch still works for this visit.
    }
  }

  // The item list runs in tiers: needed and not imported at all, then imported but still short (a
  // second source would help), then needs already covered, then anything else spare in the plan.
  // Covered items stay pickable, so a factory can still take them from somewhere new.
  const needOrder: Record<ImportNeed, number> = { missing: 0, short: 1, imported: 2, satisfied: 2 }
  const needCaptions: Record<ImportNeed, { text: string, class: string }> = {
    missing: { text: 'Not imported yet', class: 'text-medium-emphasis' },
    short: { text: 'Imported, but not enough', class: 'text-amber' },
    imported: { text: 'Imported and satisfied', class: 'text-green' },
    satisfied: { text: 'Already satisfied', class: 'text-green' },
  }

  const allItems = computed(() => {
    const factories = getFactories()
    const tier = (need: ImportNeed | null) => need ? needOrder[need] : 3

    return getImportableParts(props.factory, factories, true, true)
      .map(part => {
        const need = getImportNeed(props.factory, part)
        return { title: getPartDisplayName(part), value: part, need, needed: need !== null }
      })
      .sort((a, b) => tier(a.need) - tier(b.need) || a.title.localeCompare(b.title))
  })

  const anyNeeded = computed(() => allItems.value.some(item => item.needed))

  const partItems = computed(() =>
    filterByDemand.value ? allItems.value.filter(item => item.needed) : allItems.value
  )

  watch(isOpen, open => {
    if (!open) return
    const current = currentInput.value?.outputPart ?? null
    selectedPart.value = current
    filterByDemand.value = savedFilterPreference() && anyNeeded.value &&
      (!current || allItems.value.some(item => item.value === current && item.needed))
  }, { immediate: true })

  const partName = computed(() => selectedPart.value ? getPartDisplayName(selectedPart.value) : '')

  const sources = computed<ImportSource[]>(() => {
    if (!selectedPart.value) return []
    return getImportSources(props.factory, selectedPart.value, getFactories())
  })

  // A loop is refused even on the row being re-pointed: keeping it would keep the loop.
  const unavailable = (source: ImportSource) =>
    source.loop || (source.alreadyImported && source.factory.id !== currentFactoryId.value)

  const choose = (source: ImportSource) => {
    if (!selectedPart.value || unavailable(source)) return
    emit('select', { factoryId: source.factory.id, part: selectedPart.value, spare: source.spare })
    isOpen.value = false
  }
</script>

<style lang="scss" scoped>
// Snug under the switch, lined up with its label rather than the knob.
.demand-caption {
  line-height: 1.3;
  margin-top: -4px;
  padding-left: 44px;
}
</style>
