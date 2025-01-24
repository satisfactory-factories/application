<template>
  <div class="d-flex align-center justify-center mb-4">
    <span v-if="timer === 0" class="mr-2">
      <v-icon icon="fas fa-tire-rugged" />
    </span>
    <span v-if="timer > 0" class="mr-2">
      <v-icon icon="fas fa-tire-rugged fa-spin" />
    </span>
    <v-number-input
      v-model.number="factorySettings.truckTime"
      control-variant="stacked"
      density="compact"
      hide-details
      label="Round trip secs"
      max-width="150px"
      type="number"
      variant="outlined"
    />
    <tooltip-info text="Round Trip time is calculated by riding the truck and timing how long it takes to do a full round trip. Unload, load, unload, or 3 crane animations." />
  </div>

  <div class="mb-4 text-center">
    <v-btn v-if="timer === 0" color="primary" density="comfortable" @click="startTimer()">
      Start Timer
    </v-btn>
    <v-btn v-if="timer !== 0" color="secondary" density="comfortable" @click="stopTimer()">
      Stop Timer ({{ timer }}s)
    </v-btn>
  </div>
  <div class="text-center">
    <v-chip>
      <game-asset subject="truck" type="vehicle" />
      <span class="ml-2">Trucks: <b>{{ calculateTrucks() }}</b></span>
    </v-chip>
  </div>

</template>

<script setup lang="ts">
  import { ExportCalculatorFactorySettings, FactoryDependencyRequest } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useGameDataStore } from '@/stores/game-data-store'
  import TooltipInfo from '@/components/tooltip-info.vue'

  const gameData = useGameDataStore().getGameData()

  const props = defineProps<{
    request: FactoryDependencyRequest
    factorySettings: ExportCalculatorFactorySettings
  }>()

  const timer = ref(0)
  let timerInterval: NodeJS.Timeout

  const startTimer = () => {
    timer.value = 1
    timerInterval = setInterval(() => {
      timer.value += 1
    }, 1000)
  }

  const stopTimer = () => {
    clearInterval(timerInterval)
    props.factorySettings.truckTime = timer.value
    timer.value = 0
  }

  const calculateTrucks = () => {
    return '1'
  }
</script>
