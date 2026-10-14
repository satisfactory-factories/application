<!-- The other end of a ticked link. An export and the import it feeds are the same link seen from
     either factory, so after one end is ticked (or unticked) this offers to do the same to the
     other, and to turn that factory's checklist on if it is off. Marking the other end needs the
     checklist on, so declining the checklist locks the tick switch off. Only an offer: nothing on
     the other factory changes until Apply. See linkedImportTickOffer and linkedExportTickOffer in
     checklist.ts. -->
<template>
  <app-dialog
    v-model="isOpen"
    icon="fas fa-check-square"
    max-width="520"
    :title="title"
  >
    <template v-if="current && target">
      <div class="linked-tick d-flex align-center flex-wrap ga-2">
        <v-chip class="sf-chip small product no-margin">
          <game-asset
            height="24"
            :subject="current.part"
            type="item"
            width="24"
          />
          <span class="ml-2">
            <b>{{ getPartDisplayName(current.part) }}</b><template v-if="linkAmount !== null">: {{ formatNumber(linkAmount) }}/min</template>
          </span>
        </v-chip>
        <span>{{ isImport ? 'into' : 'from' }}</span>
        <factory-chip class="no-margin" :clickable="false" :factory="target" :jumpable="false" />
      </div>
      <v-switch
        v-if="current.offer.offerEnableChecklist"
        id="linked-tick-enable-checklist"
        v-model="enableChecklist"
        class="mt-3"
        color="primary"
        density="compact"
        hide-details
      >
        <template #label>
          <span class="mr-2">Turn on the checklist for</span>
          <factory-chip class="no-margin" :clickable="false" :factory="target" :jumpable="false" />
        </template>
      </v-switch>
      <v-switch
        v-if="current.offer.count > 0"
        id="linked-tick-switch"
        v-model="tick"
        :class="{ 'mt-3': !current.offer.offerEnableChecklist }"
        color="primary"
        density="compact"
        :disabled="tickLocked"
        hide-details
        :label="tickLabel"
      />
    </template>
    <template #actions>
      <v-btn id="linked-tick-cancel" variant="text" @click="dismiss">Cancel</v-btn>
      <v-btn
        id="linked-tick-apply"
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
  import { linkedTickTargetId, useLinkedTick } from '@/composables/useLinkedTick'
  import { linkedExportRequest, linkedImportsForExport } from '@/utils/factory-management/checklist'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'

  const findFactory = inject('findFactory') as (id: string | number) => Factory | null | undefined

  const { pending: current, confirm, dismiss } = useLinkedTick()

  // Both on by default, to steer players towards tracking both ends. Marking the other end depends
  // on its checklist: while that is off and the player declines to turn it on, the tick switch is
  // switched off and locked, so nothing is ticked out of sight.
  const tick = ref(true)
  const enableChecklist = ref(true)
  watch(current, () => {
    tick.value = true
    enableChecklist.value = true
  })

  const tickLocked = computed(() =>
    !!current.value?.offer.offerEnableChecklist && !enableChecklist.value)
  watch(tickLocked, locked => {
    tick.value = !locked
  })

  const isOpen = computed({
    get: () => current.value !== null,
    set: open => {
      if (!open) dismiss()
    },
  })

  const isImport = computed(() => current.value?.target !== 'export')
  const completed = computed(() => current.value?.offer.completed ?? true)
  const target = computed(() =>
    current.value ? findFactory(linkedTickTargetId(current.value)) ?? null : null)

  const title = computed(() =>
    `Also ${completed.value ? 'tick' : 'untick'} the ${isImport.value ? 'import' : 'export'}?`)
  const tickLabel = computed(() =>
    `Also ${completed.value ? 'mark' : 'unmark'} as ${isImport.value ? 'imported' : 'exported'}`)

  // The rate the link carries, as the factory being changed sees it.
  const linkAmount = computed(() => {
    const link = current.value
    if (!link || !target.value) return null
    if (link.target === 'export') {
      return linkedExportRequest(target.value, link.destinationFactoryId, link.part)?.amount ?? null
    }
    const inputs = linkedImportsForExport(target.value, link.sourceFactoryId, link.part)
    return inputs.length > 0 ? inputs.reduce((sum, input) => sum + input.amount, 0) : null
  })

  const accept = () => {
    confirm(target.value ?? undefined, {
      tick: tick.value && !tickLocked.value,
      enableChecklist: enableChecklist.value,
    })
  }
</script>

<style lang="scss" scoped>
.linked-tick {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 8px 12px;
}
</style>
