<template>
  <div class="d-flex align-center justify-center mb-4">
    <v-number-input
      v-model.number="factorySettings.trainTime"
      density="compact"
      hide-details
      label="Round trip secs"
      max-width="200px"
      prepend-icon="fas fa-train"
      type="number"
      variant="outlined"
    />
    <span class="ml-2 text-caption text-grey">
      <v-tooltip bottom>
        <template #activator="{ props }">
          <span v-bind="props">
            <v-icon
              icon="fas fa-info-circle"
            />
          </span>
        </template>
        <span>Round Trip time is calculated by riding the train and timing how long it takes to do a full round trip. Unload, load, unload.</span>
      </v-tooltip>
    </span>

    <div class="ml-4 pl-4 border-s">
      <v-btn v-if="timer === 0" color="primary" style="width: 120px;" @click="startTimer()">
        Start Timer
      </v-btn>
      <v-btn v-if="timer !== 0" color="secondary" style="width: 120px;" @click="stopTimer()">
        Stop Timer
      </v-btn>

      <div v-if="timer > 0" class="ml-4 text-body-1 d-inline-block" style="width: 60px">
        <span class="mr-2">{{ timer }}s</span> <i class="fa fa-hourglass fa-spin" />
      </div>
      <!-- HTML hack to make sure the buttons and input doesn't jiggle when the timer is shown -->
      <div v-if="timer === 0" class="ml-4 text-body-1 d-inline-block" style="width: 60px">
        &nbsp;
      </div>
    </div>
  </div>
  <div class="text-center">
    <v-chip v-if="!isFluid(request.part)">
      <game-asset subject="freight-car" type="item" />
      <span class="ml-2">Freight Cars: <b>{{ calculateFreightCars() }}</b></span>
    </v-chip>
    <v-chip v-if="isFluid(request.part)">
      <game-asset subject="freight-car" type="item" />
      <span class="ml-2">Fluid Freight Cars: <b>{{ calculateFluidCars() }}</b></span>
    </v-chip>
  </div>

</template>

<script setup lang="ts">
  import { ExportCalculatorFactorySettings, FactoryDependencyRequest } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useGameDataStore } from '@/stores/game-data-store'

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
    props.factorySettings.trainTime = timer.value
    timer.value = 0
  }

  const calculateFreightCars = () => {
    if (!props.request) {
      console.warn('calculateFreightCars: No request provided!')
      return '???'
    }

    const part = props.request.part

    // 1. Get the product info from game data
    const data = gameData.items.parts[part]

    if (!data.stackSize) {
      console.error(`Unable to get stack size for ${part}`)
    }

    const amount = props.request.amount
    const carCap = 32 * data.stackSize
    const rtt = props.factorySettings.trainTime ?? 123

    // Need amount per minute of the product, divided by the car capacity divided by the round trip time
    const carsNeeded = (amount / 60) / (carCap / rtt)

    return formatNumber(carsNeeded)
  }

  const calculateFluidCars = () => {
    if (!props.request) {
      console.warn('calculateFluidCars: No request provided!')
      return '???'
    }
    const amount = props.request.amount ?? 0
    const carCap = 1600
    const rtt = props.factorySettings.trainTime ?? 123

    // Need amount per minute of the product, divided by the car capacity divided by the round trip time
    const carsNeeded = (amount / 60) / (carCap / rtt)

    return formatNumber(carsNeeded)
  }

  const isFluid = (part: string) => {
    return gameData.items.parts[part].isFluid
  }
</script>
