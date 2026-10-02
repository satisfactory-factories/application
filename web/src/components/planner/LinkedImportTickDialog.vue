<!-- The other end of a ticked export. An export and the import it feeds are the same link seen
     from either factory, so after one is ticked (or unticked) this offers to do the same to the
     other, and saves the player walking to the destination to tick it by hand. Only an offer:
     closing it any way other than the confirm button leaves the destination exactly as it was.
     See linkedImportTickOffer in checklist.ts. -->
<template>
  <app-dialog
    v-model="isOpen"
    icon="fas fa-check-square"
    max-width="560"
    :title="completed ? 'Also tick the import?' : 'Also untick the import?'"
  >
    <template v-if="current && destination">
      <p class="mb-3">
        <template v-if="completed">
          You marked this export as built. Should the import on the other end be marked as built as well?
        </template>
        <template v-else>
          You unticked this export. Should the import on the other end be unticked as well?
          <span v-if="!destination.checklistEnabled">
            Its checklist is off, but the tick is still stored there.
          </span>
        </template>
      </p>
      <div class="linked-import d-flex align-center flex-wrap ga-2">
        <game-asset
          height="28"
          :subject="current.part"
          type="item"
          width="28"
        />
        <b>
          <template v-if="importAmount !== null">{{ formatNumber(importAmount) }}/min</template>
          {{ getPartDisplayName(current.part) }}
        </b>
        <span>imported into</span>
        <v-chip class="sf-chip small factory no-margin">
          <factory-icon-display :icon="destination.icon" size="20" />
          <span class="ml-2">{{ destination.name }}</span>
        </v-chip>
        <span v-if="source">from {{ source.name }}</span>
      </div>
      <template v-if="current.offer.offerEnableChecklist">
        <v-switch
          id="linked-import-enable-checklist"
          v-model="enableChecklist"
          class="mt-3"
          color="primary"
          density="compact"
          hide-details
          :label="`Turn on the checklist for ${destination.name}`"
        />
        <p class="text-medium-emphasis mb-0">
          Leave it off and the import is still stored as built: it shows ticked whenever you turn
          the checklist on there.
        </p>
      </template>
    </template>
    <template #actions>
      <v-btn id="linked-import-decline" variant="text" @click="dismiss">Just the export</v-btn>
      <v-btn
        id="linked-import-confirm"
        color="primary"
        variant="flat"
        @click="accept"
      >{{ completed ? 'Tick both' : 'Untick both' }}
      </v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { useLinkedImportTick } from '@/composables/useLinkedImportTick'
  import { linkedImportsForExport } from '@/utils/factory-management/checklist'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'

  const findFactory = inject('findFactory') as (id: string | number) => Factory | null | undefined

  const { pending: current, confirm, dismiss } = useLinkedImportTick()

  // On by default: a player ticking exports in checklist mode almost always wants the factory at
  // the other end tracked the same way.
  const enableChecklist = ref(true)
  watch(current, () => {
    enableChecklist.value = true
  })

  const isOpen = computed({
    get: () => current.value !== null,
    set: open => {
      if (!open) dismiss()
    },
  })

  const completed = computed(() => current.value?.offer.completed ?? true)
  const destination = computed(() =>
    current.value ? findFactory(current.value.destinationFactoryId) ?? null : null)
  const source = computed(() =>
    current.value ? findFactory(current.value.sourceFactoryId) ?? null : null)

  const importAmount = computed(() => {
    if (!current.value || !destination.value) return null
    const inputs = linkedImportsForExport(destination.value, current.value.sourceFactoryId, current.value.part)
    return inputs.length > 0 ? inputs.reduce((sum, input) => sum + input.amount, 0) : null
  })

  const accept = () => {
    confirm(destination.value ?? undefined, enableChecklist.value)
  }
</script>

<style lang="scss" scoped>
.linked-import {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 8px 12px;
}
</style>
