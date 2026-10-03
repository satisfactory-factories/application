<!-- How big the plan is against the cap, shown only once it matters: near the cap, at it, or
     past it. Past it is the one that costs something, and what it costs depends on the tab: a
     cloud plan stops syncing (the edits stay on this device), a local one can no longer be
     shared or moved to the cloud. -->
<template>
  <v-alert
    v-if="state"
    class="ma-2"
    data-testid="plan-size-notice"
    density="compact"
    :type="state === 'over' ? 'error' : state === 'full' ? 'warning' : 'info'"
    variant="tonal"
  >
    <template v-if="state === 'over'">
      This plan has <b>{{ count }}</b> factories, over the {{ MAX_FACTORIES_PER_PLAN }} a plan can hold.
      <template v-if="isCloud">
        Your changes are kept on this device but are not being saved to the cloud until it is back
        to {{ MAX_FACTORIES_PER_PLAN }} or fewer.
      </template>
      <template v-else>
        It cannot be shared or moved to the cloud until it is back to {{ MAX_FACTORIES_PER_PLAN }} or fewer.
      </template>
    </template>
    <template v-else-if="state === 'full'">
      This plan is at the {{ MAX_FACTORIES_PER_PLAN }} factory limit. Delete a factory to add another, or
      start the next part of your build in a new tab.
    </template>
    <template v-else>
      {{ count }} of {{ MAX_FACTORIES_PER_PLAN }} factories used.
    </template>
  </v-alert>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { useAppStore } from '@/stores/app-store'
  import { MAX_FACTORIES_PER_PLAN, planIsFull, planIsNearCap, planIsOverCap } from '@/utils/plan-size'

  const props = defineProps<{ count: number }>()

  const appStore = useAppStore()

  const state = computed<'over' | 'full' | 'near' | null>(() => {
    if (planIsOverCap(props.count)) return 'over'
    if (planIsFull(props.count)) return 'full'
    if (planIsNearCap(props.count)) return 'near'
    return null
  })

  const isCloud = computed(() => {
    const tab = appStore.getCurrentTab()
    return !!tab && appStore.getTabState(tab.id).kind !== 'local'
  })
</script>
