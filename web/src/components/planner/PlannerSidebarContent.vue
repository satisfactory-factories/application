<!-- The sidebar's actual contents — factory list, divider, global actions.
     Rendered by BOTH the docked desktop sidebar and the navigation drawer tray
     so the two can never drift apart visually. Anything drawer-specific
     (sign-in, Ko-fi, Discord) lives in Navigation.vue's append slot instead. -->
<template>
  <plan-size-notice :count="factories.length" />
  <planner-factory-list
    :factories="factories"
    :loaded-from="loadedFrom"
    :total-factories="factories.length"
    @create-factory="emit('createFactory', $event)"
    @update-factories="emit('updateFactories', $event)"
  />
  <v-divider color="#ccc" thickness="2px" />
  <planner-global-actions
    class="py-2"
    @clear-all="emit('clearAll')"
    @import-world="emit('importWorld')"
  />
  <v-divider color="#ccc" thickness="2px" />
  <copyright />
</template>

<script setup lang="ts">
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import PlannerGlobalActions from '@/components/planner/PlannerGlobalActions.vue'
  import PlanSizeNotice from '@/components/planner/PlanSizeNotice.vue'

  defineProps<{
    factories: Factory[],
    loadedFrom: 'planner' | 'navigation',
  }>()

  const emit = defineEmits<{
    (event: 'createFactory', groupId?: string | null): void;
    (event: 'updateFactories', factories: Factory[]): void;
    (event: 'clearAll'): void;
    (event: 'importWorld'): void;
  }>()
</script>
