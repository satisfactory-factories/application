<template>
  <p v-if="!selectedFactory">
    Please select a factory from the buttons above in Exports.
  </p>
  <v-row v-if="selectedFactory && factorySettings" class="ma-0">
    <v-col class="border-e pa-0" cols="12" md="3">
      <p class="text-center text-h6 border-b">Train</p>
      <div class="px-2 py-4">
        <train-calculator v-if="request" :factory-settings="factorySettings" :request="request" />
      </div>
    </v-col>
    <v-col class="border-e pa-0" cols="12" md="3">
      <p class="text-center text-h6 border-b">Drone</p>
      <div class="px-2 py-4">
        <p>DRONE</p>
      </div>
    </v-col>
    <v-col class="border-e pa-0" cols="12" md="3">
      <p class="text-center text-h6 border-b">Truck</p>
      <div class="px-2 py-4">
        <p>TRUCK</p>
      </div>
    </v-col>
    <v-col class="pa-0" cols="12" md="3">
      <p class="text-center text-h6 border-b">Tractor</p>
      <div class="px-2 py-4">
        <p>TRACTOR</p>
      </div>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { Factory, TransportMethod, transportMethodList } from '@/interfaces/planner/FactoryInterface'
  import { getPartExportRequestByRequestingFactory } from '@/utils/factory-management/exports'
  import TrainCalculator from '@/components/planner/satisfaction/calculator/TrainCalculator.vue'

  const props = defineProps<{
    factory: Factory
    part: string
  }>()

  const calculatorSettings = props.factory.exportCalculator[props.part]

  const selectedFactory = calculatorSettings.selected
  const factorySettings = selectedFactory ? calculatorSettings.factorySettings[selectedFactory] : null

  // Filter the dependency requests by requestedFactoryId to get the actual request
  const request = selectedFactory
    ? getPartExportRequestByRequestingFactory(props.factory, props.part, Number(selectedFactory))
    : null

</script>
