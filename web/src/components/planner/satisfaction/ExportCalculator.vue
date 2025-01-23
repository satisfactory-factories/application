<template>
  <p v-if="!selectedFactory">
    Please select a factory from the buttons above in Exports.
  </p>
  <pre>
{{ calculatorSettings }}
{{ request }}
  </pre>

</template>

<script setup lang="ts">
  import { Factory, TransportMethod } from '@/interfaces/planner/FactoryInterface'
  import { getPartExportRequestByRequestingFactory } from '@/utils/factory-management/exports'
  const props = defineProps<{
    factory: Factory
    part: string
  }>()

  const calculatorSettings = props.factory.exportCalculator[props.part]

  const selectedFactory = calculatorSettings.selected
  const factorySettings = selectedFactory ? calculatorSettings.factorySettings ˚: null

  const transportMethod: TransportMethod | null = factorySettings ? factorySettings.transportMethod : null

  // Filter the dependency requests by requestedFactoryId to get the actual request
  const request = selectedFactory
    ? getPartExportRequestByRequestingFactory(props.factory, props.part, Number(selectedFactory))
    : null

</script>
