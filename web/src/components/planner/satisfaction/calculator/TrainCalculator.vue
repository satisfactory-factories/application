<template>
  <div class="d-flex align-center justify-center mb-4">
    <span v-if="timer === 0" class="mr-2">
      <v-icon icon="fas fa-train" />
    </span>
    <span v-if="timer > 0" class="mr-2">
      <v-icon icon="fas fa-sync fa-spin" />
    </span>
    <v-number-input
      v-model="trainTime"
      control-variant="stacked"
      density="compact"
      hide-details
      label="Round trip secs"
      max-width="150px"
      type="number"
      variant="outlined"
    />
    <tooltip-info text="Round Trip time is calculated by riding the train and timing how long it takes to do a full round trip. Unload, load, unload aka &quot;3 choos&quot;" />
  </div>

  <div class="d-flex align-center justify-center mb-4">
    <v-btn v-if="timer === 0" color="primary" density="comfortable" @click="startTimer()">
      Start Timer
    </v-btn>
    <v-btn v-if="timer !== 0" color="secondary" density="comfortable" @click="stopTimer()">
      Stop Timer ({{ timer }}s)
    </v-btn>
  </div>
  <div class="d-flex align-center justify-center mb-4">
    <v-chip v-if="!isFluid(request.part)">
      <game-asset subject="freight-car" type="vehicle" />
      <span class="ml-2">Freight Cars: <b>{{ calculateFreightCars() }}</b></span>
    </v-chip>
    <v-chip v-if="isFluid(request.part)">
      <game-asset subject="freight-car" type="vehicle" />
      <span class="ml-2">Fluid Freight Cars: <b>{{ calculateFreightCars() }}</b></span>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
  import { toRef } from 'vue'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { ExportCalculatorFactorySettings, FactoryDependencyRequest } from '@/interfaces/planner/FactoryInterface'
  import TooltipInfo from '@/components/tooltip-info.vue'
  import { calculateTransportVehiclesForExporting, TransportMethod } from '@/utils/factory-management/exportCalculator'

  const gameData = useGameDataStore().getGameData()

  const props = defineProps<{
    request: FactoryDependencyRequest
    factorySettings: ExportCalculatorFactorySettings
  }>()

  // Writes through to the settings object held by the store — the round trip time persists with the plan.
  const trainTime = toRef(props.factorySettings, 'trainTime')

  const timer = ref(0)
  let timerInterval: ReturnType<typeof setInterval>

  const startTimer = () => {
    timer.value = 1
    timerInterval = setInterval(() => {
      timer.value += 1
    }, 1000)
  }

  const stopTimer = () => {
    clearInterval(timerInterval)
    trainTime.value = timer.value
    timer.value = 0
  }

  const calculateFreightCars = () => {
    if (!props.request) {
      console.error('TrainCalculator: calculateFreightCars: No request provided!')
      return '???'
    }

    const part = props.request.part
    const amount = props.request.amount
    const time = trainTime.value ?? 123

    return calculateTransportVehiclesForExporting(part, amount, TransportMethod.Train, time, gameData)
  }

  const isFluid = (part: string) => {
    return gameData.items.parts[part].isFluid
  }
</script>
