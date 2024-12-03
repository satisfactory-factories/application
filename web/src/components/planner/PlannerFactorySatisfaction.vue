<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h2
        v-show="factory.requirementsSatisfied && hasParts"
        class="text-h5"
      >
        <i class="fas fa-check" />
        <span class="ml-3">Satisfaction</span>
      </h2>
      <h2
        v-show="!factory.requirementsSatisfied"
        class="text-h5 text-red"
      >
        <i class="fas fa-times" />
        <span class="ml-3">Satisfaction</span>
      </h2>
      <h2
        v-show="factory.requirementsSatisfied && !hasParts"
        class="text-h5"
      >
        <i class="fas fa-question" />
        <span class="ml-3">Satisfaction</span>
      </h2>
      <v-switch
        class="ml-4"
        color="primary"
        hide-details
        label="Show Satisfaction Breakdowns"
        :model-value="showSatisfactionBreakdowns"
        @change="changeSatisfactionBreakdowns"
      />
    </div>
    <v-row v-if="hasParts">
      <v-col class="pb-1" cols="12">
        <planner-factory-satisfaction-items
          :factory="factory"
          :help-text="helpText"
        />
      </v-col>
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
  import { computed } from 'vue'

  import PlannerFactorySatisfactionBuildings from '@/components/planner/PlannerFactorySatisfactionBuildings.vue'
  import PlannerFactorySatisfactionItems from '@/components/planner/PlannerFactorySatisfactionItems.vue'
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
  }>()

  // Reactive factory parts check
  const hasParts = computed(() => Object.keys(props.factory.parts).length > 0)

  </script>
