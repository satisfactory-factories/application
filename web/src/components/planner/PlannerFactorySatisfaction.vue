<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-4 ga-2">
      <!-- One heading driven by the section's worst status, rather than a v-show'd block per
           state — the old three became four the moment a second severity existed. -->
      <h2 class="text-h5" :class="heading.class">
        <i :class="heading.icon" />
        <span class="ml-3">Satisfaction</span>
      </h2>
      <factory-status-chips detailed size="small" :statuses="sectionStatuses" />
      <v-switch
        :id="`${factory.id}-satisfaction-breakdown-toggle`"
        class="ml-4"
        color="primary"
        hide-details
        label="Show Satisfaction Breakdowns"
        :model-value="showSatisfactionBreakdowns"
        @change="changeSatisfactionBreakdowns"
      />
      <v-switch
        v-model="hideInternalOutputs"
        class="ml-4"
        color="primary"
        hide-details
        label="Hide Internal Products & Raw"
      />
    </div>
    <v-row v-if="hasParts || hasPowerProducers || hasCustomBuildings">
      <v-col v-if="hasParts" class="pb-1" cols="12">
        <planner-factory-satisfaction-items
          :factory="factory"
          :help-text="helpText"
          :show-surplus-outputs="hideInternalOutputs"
        />
      </v-col>
      <!-- Fuel-less generators (Geothermal, unfueled Augmenters) create no part demand,
           but their power and building figures must still be visible. -->
      <v-col cols="12">
        <planner-factory-satisfaction-buildings
          :factory="factory"
          :help-text="helpText"
        />
      </v-col>
    </v-row>
    <p v-else class="text-body-1">Awaiting product selection or requirements outside of Raw Resources.</p>
  </div>
</template>

<script setup lang="ts">
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { computed, ref } from 'vue'

  import PlannerFactorySatisfactionBuildings from '@/components/planner/PlannerFactorySatisfactionBuildings.vue'
  import PlannerFactorySatisfactionItems from '@/components/planner/PlannerFactorySatisfactionItems.vue'
  import FactoryStatusChips from '@/components/planner/FactoryStatusChips.vue'
  import { FactoryStatus, getSectionStatuses, highestSeverity } from '@/utils/factory-management/status'
  import { useAppStore } from '@/stores/app-store'

  const appStore = useAppStore()

  const showSatisfactionBreakdowns = appStore.getSatisfactionBreakdowns()

  const changeSatisfactionBreakdowns = () => {
    console.log('Change Satisfaction Breakdowns')
    appStore.changeSatisfactoryBreakdowns()
  }

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
    statuses?: FactoryStatus[];
  }>()

  // Reactive factory parts check
  const hasParts = computed(() => Object.keys(props.factory.parts).length > 0)

  const sectionStatuses = computed(() => getSectionStatuses(props.statuses ?? [], 'satisfaction'))

  const heading = computed(() => {
    switch (highestSeverity(sectionStatuses.value)) {
      case 'problem': return { icon: 'fas fa-times', class: 'text-red' }
      case 'warning': return { icon: 'fas fa-exclamation-triangle', class: 'text-status-warning' }
      default: return hasParts.value
        ? { icon: 'fas fa-check', class: '' }
        : { icon: 'fas fa-question', class: '' }
    }
  })

  const hasPowerProducers = computed(() => props.factory.powerProducers.length > 0)
  // A factory of nothing but custom buildings still has power and buildings worth showing.
  const hasCustomBuildings = computed(() => (props.factory.customBuildings?.length ?? 0) > 0)
  const hideInternalOutputs = ref(false)
</script>
