<!-- The plan validator for linked ticks. An export and the import it feeds are one link seen from
     either end, so a plan that has one end ticked and the other not is claiming half a link is
     built. The linked-tick offer stops that happening from here on; this catches the plans that
     got that way before it, or by declining it. Checked after every load, and only for links with
     the checklist on at one end or both (see findDesyncedLinkedTicks in checklist.ts).

     Links are listed under which end is ticked, each with its own checkbox, all ticked to start
     with. Ticking both ends is the main fix: a tick is the player saying they built it. Unticking
     is there too, because a link left ticked at one end after an untick is the other way this
     goes wrong. Both apply only to the links selected. Whatever is still out of sync when the
     dialog closes is remembered for that plan for the session, so a tab switch does not raise the
     same links again. -->
<template>
  <app-dialog
    v-model="isOpen"
    icon="fas fa-unlink"
    max-width="860"
    scrollable
    title="Imports and exports out of sync"
  >
    <template #header>
      <div class="d-flex align-center flex-wrap ga-2 px-6 pb-2">
        <v-btn id="linked-tick-sync-select-all" size="small" variant="tonal" @click="selectWhere(() => true)">Select all</v-btn>
        <v-btn id="linked-tick-sync-select-none" size="small" variant="tonal" @click="selectWhere(() => false)">Select none</v-btn>
        <v-btn
          id="linked-tick-sync-select-imports"
          :disabled="!importTicked.length"
          size="small"
          variant="tonal"
          @click="selectWhere(row => row.tickedEnd === 'import')"
        >Imports only</v-btn>
        <v-btn
          id="linked-tick-sync-select-exports"
          :disabled="!exportTicked.length"
          size="small"
          variant="tonal"
          @click="selectWhere(row => row.tickedEnd === 'export')"
        >Exports only</v-btn>
        <span class="text-medium-emphasis ml-auto">{{ selected.size }} of {{ rows.length }} selected</span>
      </div>
    </template>
    <p class="mb-4">
      {{ rows.length === 1 ? 'This link is' : `These ${rows.length} links are` }} ticked as built
      at one end but not the other. An export and the import it feeds are the same belt, train or
      drone route, so both ends should agree.
    </p>
    <section v-for="section in sections" :key="section.end" class="mb-4">
      <h3 class="text-subtitle-1 font-weight-bold mb-2">{{ section.title }}</h3>
      <label
        v-for="row in section.rows"
        :key="row.key"
        class="linked-tick-sync-row d-flex align-center ga-3 mb-2"
      >
        <input
          :checked="selected.has(row.key)"
          class="sf-tick flex-shrink-0"
          type="checkbox"
          @change="toggle(row.key)"
        >
        <div class="d-flex align-center flex-wrap ga-2 min-width-0">
          <!-- The factory and what it sends, as one chip, then where it goes. -->
          <factory-chip class="no-margin linked-tick-sync-chip" :clickable="false" :factory="row.source" :jumpable="false">
            <span>{{ row.source.name }}</span>
            <game-asset
              class="ml-3"
              height="20"
              :subject="row.part"
              type="item"
              width="20"
            />
            <b class="ml-1 text-primary">{{ getPartDisplayName(row.part) }}</b>
          </factory-chip>
          <i class="fas fa-arrow-right" />
          <factory-chip class="no-margin linked-tick-sync-chip" :clickable="false" :factory="row.destination" :jumpable="false" />
        </div>
      </label>
    </section>
    <template #actions>
      <v-btn id="linked-tick-sync-leave" variant="text" @click="leave">Leave as is</v-btn>
      <v-btn
        id="linked-tick-sync-untick"
        :disabled="!selected.size"
        variant="text"
        @click="resolve(false)"
      >Untick both ends</v-btn>
      <v-btn
        id="linked-tick-sync-tick"
        color="primary"
        :disabled="!selected.size"
        variant="flat"
        @click="resolve(true)"
      >Tick both ends
      </v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/stores/app-store'
  import { useEventBusListener } from '@/composables/useEventBusListener'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import {
    DesyncedLinkedTick,
    findDesyncedLinkedTicks,
    resolveDesyncedLinkedTicks,
  } from '@/utils/factory-management/checklist'
  import { linkedTickSyncLeftAsIs as leftAsIs } from '@/composables/useLinkedTick'
  import { getPartDisplayName } from '@/utils/helpers'

  const appStore = useAppStore()
  const { planRepairs } = storeToRefs(appStore)

  const isOpen = ref(false)
  const links = ref<DesyncedLinkedTick[]>([])
  const selected = ref(new Set<string>())
  // Found on a load while the repair dialog was still up: held until it has been dismissed, so
  // the two never stack.
  const held = ref<DesyncedLinkedTick[] | null>(null)

  const linkKey = (link: DesyncedLinkedTick) =>
    `${link.sourceFactoryId}>${link.destinationFactoryId}:${link.part}:${link.tickedEnd}`

  const signature = (found: DesyncedLinkedTick[]) =>
    `${appStore.getCurrentTab()?.id ?? ''}|${found.map(linkKey).join(',')}`

  const open = (found: DesyncedLinkedTick[]) => {
    links.value = found
    selected.value = new Set(found.map(linkKey))
    isOpen.value = true
  }

  const check = () => {
    if (isOpen.value) return
    const found = findDesyncedLinkedTicks(appStore.getFactories())
    if (!found.length || leftAsIs.has(signature(found))) return
    if (planRepairs.value.length) {
      held.value = found
      return
    }
    open(found)
  }

  useEventBusListener('loadingCompleted', check)

  watch(planRepairs, entries => {
    if (entries.length || !held.value) return
    const found = held.value
    held.value = null
    open(found)
  })

  const factoriesById = computed(() =>
    new Map(appStore.getFactories().map(factory => [String(factory.id), factory])))

  const rows = computed(() => links.value.flatMap(link => {
    const source = factoriesById.value.get(String(link.sourceFactoryId))
    const destination = factoriesById.value.get(String(link.destinationFactoryId))
    return source && destination
      ? [{ ...link, key: linkKey(link), source: source as Factory, destination: destination as Factory }]
      : []
  }))
  type Row = typeof rows.value[number]

  const importTicked = computed(() => rows.value.filter(row => row.tickedEnd === 'import'))
  const exportTicked = computed(() => rows.value.filter(row => row.tickedEnd === 'export'))
  const sections = computed(() => [
    { end: 'import', title: 'Import ticked, export not', rows: importTicked.value },
    { end: 'export', title: 'Export ticked, import not', rows: exportTicked.value },
  ].filter(section => section.rows.length))

  const toggle = (key: string) => {
    const next = new Set(selected.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    selected.value = next
  }

  const selectWhere = (predicate: (row: Row) => boolean) => {
    selected.value = new Set(rows.value.filter(predicate).map(row => row.key))
  }

  const resolve = (completed: boolean) => {
    const chosen = links.value.filter(link => selected.value.has(linkKey(link)))
    resolveDesyncedLinkedTicks(appStore.getFactories(), chosen, completed)
    isOpen.value = false
  }

  // Closed any other way (the corner button, Esc, the scrim) counts as leaving it as it is.
  const leave = () => {
    isOpen.value = false
  }

  watch(isOpen, nowOpen => {
    if (nowOpen) return
    // Whatever is still out of sync after closing was left that way on purpose.
    const remaining = findDesyncedLinkedTicks(appStore.getFactories())
    if (remaining.length) leftAsIs.add(signature(remaining))
  })
</script>

<style lang="scss" scoped>
.linked-tick-sync-row {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  cursor: pointer;
  padding: 8px 12px;
}

.min-width-0 {
  min-width: 0;
}

// The same 4px corner factory chips have everywhere else in the planner. These are not clickable,
// which on its own would draw them as pills.
.sf-chip.factory.linked-tick-sync-chip {
  border-radius: 4px !important;
}
</style>
