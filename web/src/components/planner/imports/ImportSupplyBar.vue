<!-- How much of its supplier's stock an import row takes (#46): this row, every other claim on
     the same supplier, and what is left over, or by how much the claims overshoot it. -->
<template>
  <v-tooltip location="top" max-width="360">
    <template #activator="{ props: tooltipProps }">
      <div v-bind="tooltipProps" class="import-supply" data-testid="import-supply">
        <div class="import-supply-bar">
          <div class="segment this-import" :style="{ width: pct(Math.min(share.thisImport, share.available)) }" />
          <div class="segment others" :style="{ width: pct(Math.max(0, Math.min(share.others, share.available - share.thisImport))) }" />
          <div v-if="share.over" class="segment over" :style="{ width: pct(share.over) }" />
        </div>
        <div class="text-caption text-medium-emphasis mt-1 text-truncate">
          <b class="text-high-emphasis">{{ formatNumber(share.thisImport) }}</b>
          of {{ formatNumber(share.available) }}/min available
          <span v-if="share.over" class="text-red"> · {{ formatNumber(share.over) }} short</span>
          <span v-else :class="share.spare > 0 ? 'text-green' : 'text-medium-emphasis'"> · {{ formatNumber(share.spare) }} spare</span>
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

  const props = defineProps<{
    share: ImportShare
    providerName: string
  }>()

  // Scaled to whichever is bigger, the supply or the claims on it, so an overdrawn bar still fits.
  const pct = (amount: number): string => {
    const scale = Math.max(props.share.available, props.share.thisImport + props.share.others)
    return scale > 0 ? `${(amount / scale) * 100}%` : '0%'
  }
</script>

<style lang="scss" scoped>
.import-supply {
  min-width: 160px;
  width: 100%;
}

.import-supply-bar {
  background-color: rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  display: flex;
  height: 10px;
  overflow: hidden;
}

.segment {
  height: 100%;

  &.this-import {
    background-color: rgb(var(--v-theme-primary));
  }

  &.others {
    background-color: rgba(var(--v-theme-on-surface), 0.4);
  }

  &.over {
    background-color: var(--sf-error);
  }
}
</style>
