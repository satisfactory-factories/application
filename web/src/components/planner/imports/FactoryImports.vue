<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-4 ga-2">
      <h1 class="text-h5" :class="heading.class">
        <i :class="heading.icon" />
        <span class="ml-3">Imports</span>
      </h1>
      <factory-status-chips detailed size="small" :statuses="sectionStatuses" />
    </div>
    <p v-show="helpText" class="text-body-2 mb-4">
      <i class="mdi mdi-information" /> Imports are the resources needed to produce the factory's products and ensure its satisfaction. To set up imports, you select another factory and choose one of its outputs. This creates a "request" for that output. The selected factory must fulfill this request, and you'll be notified if it cannot meet the demand. All available outputs are listed in the Outputs section of the factory you choose.
    </p>
    <div v-if="Object.keys(factory.rawResources).length > 0 || Object.keys(factory.parts).length > 0">
      <raw-resources :factory="factory" />
      <imports :factory="factory" :help-text="helpText" />
    </div>
    <p v-else class="text-body-1">Awaiting product selection.</p>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import RawResources from '@/components/planner/imports/RawResources.vue'
  import Imports from '@/components/planner/imports/Imports.vue'
  import FactoryStatusChips from '@/components/planner/FactoryStatusChips.vue'
  import { FactoryStatus, getSectionStatuses, highestSeverity } from '@/utils/factory-management/status'

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
    statuses?: FactoryStatus[];
  }>()

  const sectionStatuses = computed(() => getSectionStatuses(props.statuses ?? [], 'imports'))

  const heading = computed(() => {
    switch (highestSeverity(sectionStatuses.value)) {
      case 'problem': return { icon: 'mdi mdi-close', class: 'text-red' }
      case 'warning': return { icon: 'mdi mdi-alert', class: 'text-status-warning' }
      default: return { icon: 'mdi mdi-import', class: '' }
    }
  })
</script>
