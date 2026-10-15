<!-- The other end of a ticked link. An export and the import it feeds are the same link seen from
     either factory, so after one end is ticked (or unticked) this offers to do the same to the
     other, and to turn that factory's checklist on if it is off. The other end's tick sits in its
     factory chip, already showing the state Apply will leave it in, so ticking and unticking are
     one dialog and the player changes the outcome by clicking that tick. Marking the other end
     needs the checklist on, so declining the checklist clears the tick, and ticking it again turns
     the checklist back on. Only an offer: nothing on the other factory changes until Apply. See
     linkedImportTickOffer and linkedExportTickOffer in checklist.ts. -->
<template>
  <app-dialog
    v-model="isOpen"
    :icon="isImport ? 'fas fa-arrow-to-right' : 'fas fa-truck-container'"
    max-width="560"
    :title="title"
  >
    <template v-if="current && target">
      <!-- Drawn in the direction the item flows: the exporting factory, then the item, for an
           export; the item, then the importing factory, for an import. -->
      <div class="linked-tick d-flex align-center ga-2">
        <template v-if="!isImport">
          <factory-chip
            :checked="targetChecked"
            class="no-margin linked-tick-factory"
            :clickable="false"
            :factory="target"
            :jumpable="false"
            :tick-title="tickTitle"
            @toggle="toggleTick"
          />
          <i class="fas fa-arrow-right" />
        </template>
        <v-chip class="sf-chip small product no-margin flex-shrink-0">
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
        <template v-if="isImport">
          <i class="fas fa-arrow-right" />
          <factory-chip
            :checked="targetChecked"
            class="no-margin linked-tick-factory"
            :clickable="false"
            :factory="target"
            :jumpable="false"
            :tick-title="tickTitle"
            @toggle="toggleTick"
          />
        </template>
      </div>
      <v-switch
        v-if="current.offer.offerEnableChecklist"
        id="linked-tick-enable-checklist"
        v-model="enableChecklist"
        class="mt-3"
        color="primary"
        density="compact"
        hide-details
        :label="`Turn on the checklist for ${target.name}`"
      />
    </template>
    <template #actions>
      <v-btn
        id="linked-tick-cancel"
        color="error"
        variant="text"
        @click="dismiss"
      >Cancel
      </v-btn>
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
  // on its checklist: while that is off and the player declines to turn it on, the chip's tick is
  // cleared, so nothing is ticked out of sight.
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

  const title = computed(() => `Also update the ${isImport.value ? 'import' : 'export'}?`)

  // The tick in the other factory's chip shows where Apply leaves that end: ticked when this end
  // was ticked and the offer is taken, unticked when this end was unticked and it is taken.
  // Undefined draws no tick, for an offer that only turns the checklist on.
  const targetChecked = computed(() => {
    if (!current.value || current.value.offer.count === 0) return undefined
    const apply = tick.value && !tickLocked.value
    return completed.value ? apply : !apply
  })
  const tickTitle = computed(() => isImport.value ? 'Mark as imported' : 'Mark as exported')

  // Ticking the chip while its checklist is declined means the player wants it marked after all,
  // which needs the checklist, so it comes back on with the tick.
  const toggleTick = () => {
    if (tickLocked.value) {
      enableChecklist.value = true
      return
    }
    tick.value = !tick.value
  }

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

// One line, in flow order: a long factory name gives way first, ellipsed by the chip itself, so
// the arrow never wraps away from what it points at.
.linked-tick-factory {
  min-width: 0;
}
</style>
