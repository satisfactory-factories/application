<template>
  <p v-if="!selectedFactory">
    Please select a factory from the buttons above in Exports.
  </p>
  <div v-if="selectedFactory && factorySettings">
    <div class="text-center border-b pb-4 mb-4">
      <p class="mb-2">Transport Method:</p>
      <v-btn
        v-for="method in transportMethodList"
        :key="method"
        class="mr-2"
        :color="factorySettings.transportMethod === method ? 'primary' : ''"
        @click="factorySettings.transportMethod = method"
      >
        {{ method }}
      </v-btn>
    </div>

    <div v-show="factorySettings.transportMethod === TransportMethod.Train">
      <train-calculator v-if="request" :factory-settings="factorySettings" :request="request" />
    </div>
    <div v-show="factorySettings.transportMethod === TransportMethod.Drone">
      DRONE transport
    </div>
    <div v-show="factorySettings.transportMethod === TransportMethod.Truck">
      TRUCK transport
    </div>
    <div v-show="factorySettings.transportMethod === TransportMethod.Tractor">
      TRACTOR transport
    </div>
  </div>
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
