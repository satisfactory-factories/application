<template>
  <div class="d-flex align-center justify-center mb-2">
    <span class="mr-2 pb-5">
      <v-icon icon="fas fa-drone" />
    </span>
    <v-text-field
      v-model="timeString"
      density="compact"
      label="Round trip time"
      max-width="190px"
      :rules="timeRules"
      variant="outlined"
      @update:model-value="calculateSeconds()"
    />
    <tooltip-info classes="pb-6" text="Round trip time is shown to you in the drone port's UI. <br>This does mean you need to configure the route, run it, then see the duration.<br> However, you will know how many drones you require to be efficient." />
  </div>
  <div class="d-flex align-center justify-center">
    <v-chip>
      <game-asset subject="drone" type="vehicle" />
      <span class="ml-2">Drones: <b>{{ calculateDrones() }}</b></span>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
  import { ExportCalculatorFactorySettings, FactoryDependencyRequest } from '@/interfaces/planner/FactoryInterface'
  import { useGameDataStore } from '@/stores/game-data-store'
  import TooltipInfo from '@/components/tooltip-info.vue'
  import { calculateTransportVehiclesForExporting, TransportMethod } from '@/utils/factory-management/exportCalculator'

  const gameData = useGameDataStore().getGameData()

  const props = defineProps<{
    request: FactoryDependencyRequest
    factorySettings: ExportCalculatorFactorySettings
  }>()

  const timeString = ref('0:42')
  let droneTime = props.factorySettings.droneTime

  const timeRules = [
    (value: string) => !!value || 'Time is required',
    (value: string) => {
      // Regex explanation:
      // - ^ start of string
      // - ([0-5]?\d)  => minutes can be:
      //       0–59 (with or without a leading zero)
      // - :
      // - ([0-5]\d)  => seconds must be two digits, 00–59
      // - $ end of string
      const validTimeRegex = /^([0-5]?\d):([0-5]\d)$/
      return validTimeRegex.test(value) || 'Enter a valid time in MM:SS'
    },
  ]

  const calculateSeconds = () => {
    console.log('calculateSeconds', timeString.value)
    const [minutes, seconds] = timeString.value.split(':').map(Number)
    droneTime = minutes * 60 + seconds
  }

  const calculateDrones = () => {
    if (!props.request) {
      console.warn('calculateFreightCars: No request provided!')
      return '???'
    }

    const part = props.request.part
    const amount = props.request.amount

    return calculateTransportVehiclesForExporting(part, amount, TransportMethod.Drone, droneTime, gameData)
  }
</script>
