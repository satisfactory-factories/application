<!-- The other end of a ticked export. An export and the import it feeds are the same link seen
     from either factory, so after one is ticked (or unticked) this offers to do the same to the
     other, and to turn the destination's checklist on if it is off. Only an offer: nothing on the
     destination changes until Apply. See linkedImportTickOffer in checklist.ts. -->
<template>
  <app-dialog
    v-model="isOpen"
    icon="fas fa-check-square"
    max-width="520"
    :title="completed ? 'Also tick the import?' : 'Also untick the import?'"
  >
    <template v-if="current && destination">
      <div class="linked-import d-flex align-center flex-wrap ga-2">
        <v-chip class="sf-chip small product no-margin">
          <game-asset
            height="24"
            :subject="current.part"
            type="item"
            width="24"
          />
          <span class="ml-2">
            <b>{{ getPartDisplayName(current.part) }}</b><template v-if="importAmount !== null">: {{ formatNumber(importAmount) }}/min</template>
          </span>
        </v-chip>
        <span>into</span>
        <v-chip class="sf-chip small factory no-margin">
          <factory-icon-display :icon="destination.icon" size="20" />
          <span class="ml-2">{{ destination.name }}</span>
        </v-chip>
      </div>
      <v-switch
        v-if="current.offer.offerEnableChecklist"
        id="linked-import-enable-checklist"
        v-model="enableChecklist"
        class="mt-3"
        color="primary"
        density="compact"
        hide-details
      >
        <template #label>
          <span class="mr-2">Turn on the checklist for</span>
          <v-chip class="sf-chip small factory no-margin">
            <factory-icon-display :icon="destination.icon" size="20" />
            <span class="ml-2">{{ destination.name }}</span>
          </v-chip>
        </template>
      </v-switch>
      <v-switch
        v-if="current.offer.importCount > 0"
        id="linked-import-tick"
        v-model="tickImports"
        :class="{ 'mt-3': !current.offer.offerEnableChecklist }"
        color="primary"
        density="compact"
        hide-details
        :label="completed ? 'Also mark as imported' : 'Also unmark as imported'"
      />
    </template>
    <template #actions>
      <v-btn id="linked-import-cancel" variant="text" @click="dismiss">Cancel</v-btn>
      <v-btn
        id="linked-import-apply"
        color="primary"
        variant="flat"
        @click="accept"
      >Apply
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

  // Both on by default, the import tick even when the destination's checklist is off and stays
  // off: the point is to steer players towards tracking both ends. Declining the checklist still
  // stores the import's tick, so it is already ticked whenever the checklist goes on.
  const tickImports = ref(true)
  const enableChecklist = ref(true)
  watch(current, () => {
    tickImports.value = true
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

  const importAmount = computed(() => {
    if (!current.value || !destination.value) return null
    const inputs = linkedImportsForExport(destination.value, current.value.sourceFactoryId, current.value.part)
    return inputs.length > 0 ? inputs.reduce((sum, input) => sum + input.amount, 0) : null
  })

  const accept = () => {
    confirm(destination.value ?? undefined, {
      tickImports: tickImports.value,
      enableChecklist: enableChecklist.value,
    })
  }
</script>

<style lang="scss" scoped>
.linked-import {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 8px 12px;
}
</style>
