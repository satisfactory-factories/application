<!-- Says which factories the Statistics totals leave out, above every one of those totals. Shown
     collapsed and expanded alike: a player back after a break has to see it before any number,
     or the totals read as the whole plan when they are not. Nothing renders without a ghost. -->
<template>
  <v-card-text v-if="ghosts.length" id="stats-ghost-banner" class="ghost-banner text-body-1 d-flex align-center flex-wrap ga-2 py-2">
    <span class="d-flex align-center font-weight-bold">
      <i class="fas fa-ghost mr-2" />
      {{ ghosts.length === 1 ? 'Ghost factory' : `${ghosts.length} ghost factories` }} left out of these totals:
    </span>
    <factory-chip
      v-for="ghost in ghosts"
      :key="ghost.id"
      class="no-margin"
      :factory="ghost"
      jump-title="Jump to this ghost factory"
      @jump="navigateToFactory(ghost.id)"
      @open="navigateToFactory(ghost.id)"
    >
      {{ ghost.name }} <span class="text-medium-emphasis">({{ ghostAgeLabel(ghost) === 'today' ? 'since today' : `for ${ghostAgeLabel(ghost)}` }})</span>
    </factory-chip>
    <tooltip-info :text="GHOST_HELP_TEXT" />
  </v-card-text>
</template>

<script setup lang="ts">
  import { computed, inject } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { GHOST_HELP_TEXT, ghostAgeLabel, ghostFactories } from '@/utils/factory-management/ghost'
  import FactoryChip from '@/components/planner/FactoryChip.vue'

  const props = defineProps<{
    factories: Factory[]
  }>()

  const ghosts = computed(() => ghostFactories(props.factories))

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void
</script>

<style lang="scss" scoped>
.ghost-banner {
  border: 2px dashed var(--sf-ghost-border);
  border-radius: 4px;
  margin: 8px 16px 0;
  color: var(--sf-ghost);
}
</style>
