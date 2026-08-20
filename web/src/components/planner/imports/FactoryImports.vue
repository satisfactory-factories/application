<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-4 ga-2">
      <h1 class="text-h5" :class="heading.class">
        <i :class="heading.icon" />
        <span class="ml-3">Imports</span>
      </h1>
      <factory-status-chips detailed size="small" :statuses="sectionStatuses" />
    </div>
    <div v-if="Object.keys(factory.rawResources).length > 0 || Object.keys(factory.parts).length > 0">
      <raw-resources :factory="factory" />
      <imports :factory="factory" />
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
    statuses?: FactoryStatus[];
  }>()

  const sectionStatuses = computed(() => getSectionStatuses(props.statuses ?? [], 'imports'))

  const heading = computed(() => {
    switch (highestSeverity(sectionStatuses.value)) {
      case 'problem': return { icon: 'fas fa-times', class: 'text-red' }
      case 'warning': return { icon: 'fas fa-exclamation-triangle', class: 'text-status-warning' }
      default: return { icon: 'fas fa-arrow-to-right', class: '' }
    }
  })
</script>
