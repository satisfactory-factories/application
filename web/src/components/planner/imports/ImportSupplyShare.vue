<!-- How much of its supplier's stock an import row takes (#46), as a small pie beside the figures:
     this row in blue, every other claim on the same supplier in grey, what is left as the empty
     ring, and red when the claims overshoot what the supplier has. -->
<template>
  <v-tooltip location="top" max-width="360">
    <template #activator="{ props: tooltipProps }">
      <div v-bind="tooltipProps" class="import-supply-share d-flex align-center" data-testid="import-supply">
        <svg class="share-pie flex-shrink-0" height="32" viewBox="0 0 36 36" width="32">
          <circle class="track" cx="18" cy="18" :r="RADIUS" />
          <circle
            v-for="slice in slices"
            :key="slice.kind"
            :class="slice.kind"
            cx="18"
            cy="18"
            :r="RADIUS"
            :stroke-dasharray="`${slice.length} ${CIRCUMFERENCE}`"
            :stroke-dashoffset="-slice.offset"
          />
        </svg>
        <div class="ml-3 text-body-2">
          <div>
            <b>{{ formatNumber(share.thisImport) }}</b>
            <span class="text-medium-emphasis"> of {{ formatNumber(share.available) }}/min</span>
          </div>
          <div v-if="share.over" class="text-red">{{ formatNumber(share.over) }}/min short</div>
          <div v-else :class="share.spare > 0 ? 'text-green' : 'text-medium-emphasis'">
            {{ formatNumber(share.spare) }}/min spare
          </div>
        </div>
      </div>
    </template>
    <div>
      {{ providerName }} has {{ formatNumber(share.available) }}/min to hand out after its own use.
    </div>
    <div>This import: {{ formatNumber(share.thisImport) }}/min</div>
    <div>Other imports from it: {{ formatNumber(share.others) }}/min</div>
    <div v-if="share.over">Short by {{ formatNumber(share.over) }}/min</div>
    <div v-else>Still spare: {{ formatNumber(share.spare) }}/min</div>
  </v-tooltip>
</template>

<script setup lang="ts">
  import { formatNumber } from '@/utils/numberFormatter'
  import { ImportShare } from '@/utils/factory-management/inputs'

  const RADIUS = 14
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS

  const props = defineProps<{
    share: ImportShare
    providerName: string
  }>()

  // Slices laid end to end round the ring. Scaled to whichever is bigger, the supply or the claims
  // on it, so an overdrawn supplier still fits, with the overshoot as its own red slice.
  const slices = computed(() => {
    const { available, thisImport, others, over } = props.share
    const scale = Math.max(available, thisImport + others)
    if (scale <= 0) return []

    const parts = [
      { kind: 'this-import', amount: Math.min(thisImport, available) },
      { kind: 'others', amount: Math.max(0, Math.min(others, available - thisImport)) },
      { kind: 'over', amount: over },
    ]

    let offset = 0
    return parts.filter(part => part.amount > 0).map(part => {
      const length = (part.amount / scale) * CIRCUMFERENCE
      const slice = { kind: part.kind, length, offset }
      offset += length
      return slice
    })
  })
</script>

<style lang="scss" scoped>
.share-pie {
  // Starts at twelve o'clock rather than three.
  transform: rotate(-90deg);

  circle {
    fill: none;
    stroke-width: 8;
  }

  .track {
    stroke: rgba(var(--v-theme-on-surface), 0.12);
  }

  .this-import {
    stroke: rgb(var(--v-theme-primary));
  }

  .others {
    stroke: rgba(var(--v-theme-on-surface), 0.45);
  }

  .over {
    stroke: var(--sf-error);
  }
}
</style>
