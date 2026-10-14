<!-- The plan validator for linked ticks. An export and the import it feeds are one link seen from
     either end, so a plan that has one end ticked and the other not is claiming half a link is
     built. The linked-tick offer stops that happening from here on; this catches the plans that
     got that way before it, or by declining it. Checked after every load, and only for links with
     the checklist on at one end or both (see findDesyncedLinkedTicks in checklist.ts).

     Ticking both ends is the main fix: a tick is the player saying they built it. Unticking is
     there too, because a link left ticked at one end after an untick is the other way this goes
     wrong. "Leave as is" is remembered for that plan, with those links, for the session, so a tab
     switch does not raise it again. -->
<template>
  <app-dialog
    v-model="isOpen"
    icon="fas fa-unlink"
    max-width="860"
    scrollable
    title="Imports and exports out of step"
  >
    <p class="mb-4">
      {{ links.length === 1 ? 'This link is' : `These ${links.length} links are` }} ticked as built
      at one end but not the other. An export and the import it feeds are the same belt, train or
      drone route, so both ends should agree.
    </p>
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="linked-tick-sync-row d-flex align-center ga-4 mb-2"
    >
      <div class="d-flex align-center flex-wrap flex-grow-1 ga-2">
        <factory-chip class="no-margin" :clickable="false" :factory="row.source" :jumpable="false" />
        <i class="fas fa-arrow-right" />
        <v-chip class="sf-chip small product no-margin">
          <game-asset
            height="24"
            :subject="row.part"
            type="item"
            width="24"
          />
          <span class="ml-2"><b>{{ getPartDisplayName(row.part) }}</b></span>
        </v-chip>
        <i class="fas fa-arrow-right" />
        <factory-chip class="no-margin" :clickable="false" :factory="row.destination" :jumpable="false" />
      </div>
      <span class="text-medium-emphasis text-right flex-shrink-0">
        {{ row.tickedEnd === 'import' ? 'Import ticked' : 'Export ticked' }}
      </span>
    </div>
    <template #actions>
      <v-btn id="linked-tick-sync-leave" variant="text" @click="leave">Leave as is</v-btn>
      <v-btn id="linked-tick-sync-untick" variant="text" @click="resolve(false)">Untick both ends</v-btn>
      <v-btn
        id="linked-tick-sync-tick"
        color="primary"
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
  // Found on a load while the repair dialog was still up: held until it has been dismissed, so
  // the two never stack.
  const held = ref<DesyncedLinkedTick[] | null>(null)

  const signature = (found: DesyncedLinkedTick[]) =>
    `${appStore.getCurrentTab()?.id ?? ''}|` +
    found.map(link => `${link.sourceFactoryId}>${link.destinationFactoryId}:${link.part}:${link.tickedEnd}`).join(',')

  const open = (found: DesyncedLinkedTick[]) => {
    links.value = found
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
      ? [{ ...link, source: source as Factory, destination: destination as Factory }]
      : []
  }))

  const resolve = (completed: boolean) => {
    resolveDesyncedLinkedTicks(appStore.getFactories(), links.value, completed)
    isOpen.value = false
  }

  // Closed any other way (the corner button, Esc, the scrim) counts as leaving it as it is.
  const leave = () => {
    isOpen.value = false
  }

  watch(isOpen, nowOpen => {
    if (nowOpen) return
    // Whatever is still out of step after closing was left that way on purpose.
    const remaining = findDesyncedLinkedTicks(appStore.getFactories())
    if (remaining.length) leftAsIs.add(signature(remaining))
  })
</script>

<style lang="scss" scoped>
.linked-tick-sync-row {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 8px 12px;
}
</style>
