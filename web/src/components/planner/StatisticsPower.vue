<template>
  <h1 class="text-h5">
    <i class="fas fa-power-off mr-3" />Power Consumption and Generation
  </h1>
  <p v-show="helpText" class="mb-4">
    <i class="fas fa-info-circle mr-2" />Shows world level power consumption and generation data.
  </p>
  <v-chip
    class="sf-chip yellow"
    variant="tonal"
  >
    <i class="fas fa-bolt" />
    <i class="fas fa-minus" />
    <span class="ml-2">{{ powerConsumed.value }} {{ powerConsumed.unit }} consumed</span>
    <template v-if="hasVariablePower">
      <span class="ml-1">(peaks at {{ powerConsumedMax.value }} {{ powerConsumedMax.unit }})</span>
      <tooltip-info text="Variable-power buildings (Particle Accelerator etc.) oscillate between a minimum and maximum draw. The main figure is the average; size your grid (or batteries) for the peak." />
    </template>
  </v-chip>
  <v-chip
    class="sf-chip yellow"
    variant="tonal"
  >
    <i class="fas fa-bolt" />
    <i class="fas fa-plus" />
    <span class="ml-2">{{ powerProduced.value }} {{ powerProduced.unit }} generated</span>
  </v-chip>
  <v-chip
    class="sf-chip"
    :class="{
      'green': totalPower.totalPowerDifference > 0,
      'red': totalPower.totalPowerDifference < 0,
    }"
    variant="tonal"
  >
    <i class="fas fa-plug mr-2" />{{ powerDifference.value }} {{ powerDifference.unit }} difference
  </v-chip>
</template>

<script setup lang="ts">
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { calculateTotalPower } from '@/utils/statistics'
  import { formatPower } from '@/utils/numberFormatter'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const totalPower = computed(() => calculateTotalPower(props.factories))
  const powerConsumed = computed(() => {
    return {
      value: formatPower(totalPower.value.totalPowerConsumed).value,
      unit: formatPower(totalPower.value.totalPowerConsumed).unit,
    }
  })
  const powerConsumedMax = computed(() => {
    return {
      value: formatPower(totalPower.value.totalPowerConsumedMax).value,
      unit: formatPower(totalPower.value.totalPowerConsumedMax).unit,
    }
  })
  const hasVariablePower = computed(() => totalPower.value.totalPowerConsumedMax > totalPower.value.totalPowerConsumed)
  const powerProduced = computed(() => {
    return {
      value: formatPower(totalPower.value.totalPowerProduced).value,
      unit: formatPower(totalPower.value.totalPowerProduced).unit,
    }
  })
  const powerDifference = computed(() => {
    return {
      value: formatPower(totalPower.value.totalPowerDifference).value,
      unit: formatPower(totalPower.value.totalPowerDifference).unit,
    }
  })
</script>
