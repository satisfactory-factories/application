<!-- The sidebar's actual contents — factory list, divider, global actions.
     Rendered by BOTH the docked desktop sidebar and the navigation drawer tray
     so the two can never drift apart visually. Anything drawer-specific
     (sign-in, Ko-fi, Discord) lives in Navigation.vue's append slot instead. -->
<template>
  <planner-factory-list
    :factories="factories"
    :loaded-from="loadedFrom"
    :total-factories="factories.length"
    @create-factory="emit('createFactory')"
    @update-factories="emit('updateFactories', $event)"
  />
  <v-divider color="#ccc" thickness="2px" />
  <planner-global-actions
    class="py-2"
    :help-text-shown="helpTextShown"
    @clear-all="emit('clearAll')"
    @hide-all="emit('hideAll')"
    @import-world="emit('importWorld')"
    @show-all="emit('showAll')"
    @toggle-help-text="emit('toggleHelpText')"
  />
  <v-divider color="#ccc" thickness="2px" />
  <copyright />
</template>

<script setup lang="ts">
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import PlannerGlobalActions from '@/components/planner/PlannerGlobalActions.vue'

  defineProps<{
    factories: Factory[],
    loadedFrom: 'planner' | 'navigation',
    helpTextShown: boolean,
  }>()

  const emit = defineEmits<{
    (event: 'createFactory'): void;
    (event: 'updateFactories', factories: Factory[]): void;
    (event: 'clearAll'): void;
    (event: 'hideAll'): void;
    (event: 'showAll'): void;
    (event: 'importWorld'): void;
    (event: 'toggleHelpText'): void;
  }>()
</script>
