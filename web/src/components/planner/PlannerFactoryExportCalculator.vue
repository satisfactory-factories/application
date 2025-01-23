<template>
  <div class="text-center mb-2 border-b">
    <div class="text-h5 text-center">
      <p>
        <i class="fas fa-calculator" />
        <span class="ml-2">Export calculations to</span>
      </p>
      <v-chip class="sf-chip small">
        <i class="fas fa-industry" />
        <span class="ml-2"><b>{{ destFactory.name }}:</b> {{ request?.amount ?? '???' }}/min</span>
      </v-chip>
    </div>
    <p class="text-body-1 mb-2" />
  </div>
  <div class="text-center border-b py-2">
    <v-chip
      v-for="belt in ['mk-1', 'mk-2', 'mk-3', 'mk-4', 'mk-5', 'mk-6']"
      :key="belt"
      class="mr-1 mb-1"
    >
      <game-asset :subject="`conveyor-belt-${belt}`" type="building" />
      <span v-if="request" class="ml-2">
        <b>{{ beltDisplay(belt) }}:</b> {{ calculateBelts(request.amount, belt) }}x
      </span>
      <span v-if="!request" class="ml-2">
        <b>{{ beltDisplay(belt) }}:</b> ???
      </span>
    </v-chip>
  </div>
  <div class="mt-4">
    <p v-if="helpText" class="text-body-2 text-center">
      <i class="fas fa-info-circle" />
      <span class="ml-1">
        It is assumed you are feeding the freight platforms with sufficient belt capacity.<br>Time is from the destination factory to the source factory and back, aka "three choos".
      </span>
    </p>
    <div class="d-flex justify-center align-center text-center mt-2">
      <v-text-field
        v-model.number="destFactorySettings.trainTime"
        density="compact"
        hide-details
        label="Round trip secs"
        max-width="160px"
        prepend-icon="fas fa-train"
        type="number"
        variant="outlined"
      />
      <v-chip v-if="!isFluid(product.id)" class="ml-2">
        <game-asset subject="freight-car" type="item" />
        <span class="ml-2">Freight Cars: {{ calculateFreightCars() }}</span>
      </v-chip>
      <v-chip v-if="isFluid(product.id)" class="ml-2">
        <game-asset subject="freight-car" type="item" />
        <span class="ml-2">Fluid Freight Cars: {{ calculateFluidCars() }}</span>
      </v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { defineProps } from 'vue'
  import { formatNumber } from '@/utils/numberFormatter'
  import {
    Factory,
    FactoryDependencyRequest,
    FactoryItem,
  } from '@/interfaces/planner/FactoryInterface'
  import { useGameDataStore } from '@/stores/game-data-store'

  const gameData = useGameDataStore().getGameData()

  const props = defineProps<{
    factory: Factory;
    destFactory: Factory;
    request: FactoryDependencyRequest | undefined;
    product: FactoryItem | undefined;
    helpText: boolean;
  }>()

  if (!props.request) {
    console.error('Export Calculator: No request provided!')
  }

  if (!props.product) {
    throw new Error('Export Calculator: No product provided!')
  }

  const settings = props.factory.exportCalculator[props.product.id.toString()][props.destFactory.id.toString()]

  const calculateBelts = (amount: number, beltType: string) => {
    // Simple math here to divide the amount by the belt's capacity
    let beltThroughput

    switch (beltType) {
      case 'mk-1':
        beltThroughput = 60
        break
      case 'mk-2':
        beltThroughput = 120
        break
      case 'mk-3':
        beltThroughput = 270
        break
      case 'mk-4':
        beltThroughput = 480
        break
      case 'mk-5':
        beltThroughput = 780
        break
      case 'mk-6':
        beltThroughput = 1200
        break
      default:
        beltThroughput = -1
        break
    }

    return formatNumber(amount / beltThroughput)
  }

  const beltDisplay = (belt: string) => {
    // Remove the dash and capitalize the first letter
    return belt.replace('-', '').replace(/\b\w/g, l => l.toUpperCase())
  }

  const calculateFreightCars = () => {
    if (!props.request) {
      console.warn('calculateFreightCars: No request provided!')
      return '???'
    }

    const part = props.product.id

    // 1. Get the product info from game data
    const data = gameData.items.parts[part]

    if (!data.stackSize) {
      console.error(`Unable to get stack size for ${part}`)
    }

    const amount = props.request.amount
    const carCap = 32 * data.stackSize
    const rtt = props.destFactorySettings.trainTime ?? 123

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
    const rtt = props.destFactorySettings.trainTime ?? 123

    // Need amount per minute of the product, divided by the car capacity divided by the round trip time
    const carsNeeded = (amount / 60) / (carCap / rtt)

    return formatNumber(carsNeeded)
  }

  const isFluid = (part: string) => {
    return gameData.items.parts[part].isFluid
  }

</script>
