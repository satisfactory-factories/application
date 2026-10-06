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
          v-model="filterByDemand"
          class="mb-3"
          color="primary"
          data-testid="import-filter-demand"
          density="compact"
          :disabled="!anyNeeded"
          hide-details
          label="Filter by demand: only items this factory uses"
        />
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
            <v-list-item v-bind="itemProps" :subtitle="item.needed ? 'Needed by this factory' : undefined">
              <template #prepend>
                <game-asset
                  class="mr-2"
                  height="28px"
                  :subject="item.value"
                  type="item"
                  width="28px"
                />
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
        :disabled="source.alreadyImported && source.factory.id !== currentFactoryId"
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
          <span :class="source.spare > 0 ? 'text-green' : 'text-red'">
            {{ formatNumber(source.spare) }}/min spare
          </span>
        </v-list-item-subtitle>
        <template #append>
          <v-btn
            color="primary"
            :disabled="source.alreadyImported && source.factory.id !== currentFactoryId"
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
    getImportSources,
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
  // the list down to just the needed ones. It starts on when there is something needed to show,
  // and off for a hub or a row being re-pointed to an item it does not use, which would otherwise
  // open on an empty or incomplete list (the #46 tester reports).
  const filterByDemand = ref(false)

  const allItems = computed(() => {
    const factories = getFactories()
    const needed = new Set(getImportableParts(props.factory, factories, false))
    const byName = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title)
    const items = getImportableParts(props.factory, factories, true)
      .map(part => ({ title: getPartDisplayName(part), value: part, needed: needed.has(part) }))

    return [
      ...items.filter(item => item.needed).sort(byName),
      ...items.filter(item => !item.needed).sort(byName),
    ]
  })

  const anyNeeded = computed(() => allItems.value.some(item => item.needed))

  const partItems = computed(() =>
    filterByDemand.value ? allItems.value.filter(item => item.needed) : allItems.value
  )

  watch(isOpen, open => {
    if (!open) return
    const current = currentInput.value?.outputPart ?? null
    selectedPart.value = current
    filterByDemand.value = anyNeeded.value &&
      (!current || allItems.value.some(item => item.value === current && item.needed))
  }, { immediate: true })

  const partName = computed(() => selectedPart.value ? getPartDisplayName(selectedPart.value) : '')

  const sources = computed<ImportSource[]>(() => {
    if (!selectedPart.value) return []
    return getImportSources(props.factory, selectedPart.value, getFactories())
  })

  const choose = (source: ImportSource) => {
    if (!selectedPart.value) return
    emit('select', { factoryId: source.factory.id, part: selectedPart.value, spare: source.spare })
    isOpen.value = false
  }
</script>
