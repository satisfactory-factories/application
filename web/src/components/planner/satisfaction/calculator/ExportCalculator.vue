<template>
  <div v-if="!selectedFactory" class="d-flex flex-column justify-center h-100">
    <p class="text-h6 align-self-center">
      Please select a factory from the buttons above in Exports.
    </p>
  </div>
  <v-row v-if="selectedFactory && factorySettings" class="ma-0 h-100">
    <!-- Train -->
    <v-col class="border-e-md pa-0 d-flex flex-column" cols="12" md="3">
      <div class="border-b text-center py-2">
        <div class="d-flex align-center text-h6 justify-center">
          <game-asset subject="electric-locomotive" type="vehicle" />
          <span class="ml-2">Train</span>
          <tooltip-info text="It is assumed you are using a pair of train stations with no intermediate stops and no loading rules.<br>NOTE: This is an <b>approximation</b>. The round time may differ by traffic conditions, routing and other variables." />
        </div>
        <v-chip color="green" density="compact">Great accuracy <tooltip-info text="Subject to inaccuracies due to traffic, acceleration forces (e.g. if stopped on a<br>hill due to traffic, takes a LONG time to speed up), and waiting times at stations. Otherwise very accurate." /></v-chip>
      </div>
      <div v-if="request" class="pt-4 px-2">
        <train-calculator v-if="request" :factory-settings="factorySettings" :request="request" />
      </div>
    </v-col>
    <!-- Drone -->
    <v-col class="border-e-md pa-0 d-flex flex-column" cols="12" md="3">
      <div class="border-b text-center py-2">
        <div class="d-flex align-center text-h6 justify-center">
          <game-asset subject="drone" type="vehicle" />
          <span class="ml-2">Drone</span>
          <tooltip-info text="It is assumed you are using <b>one</b> pair of drone stations, and that there is no waiting time.<br>If you have a significant amount of waiting time, you should create more port pairs. As long as pairs are geographically near each other, this calculator will be accurate.<br>It is practically impossible to calculate waiting time, so reducing it will make this calculator more accurate." />
        </div>
        <v-chip color="blue" density="compact">Excellent accuracy <tooltip-info text="Extremely accurate as drones are based on a 'flight on rails' system,<br> disregarding terrain and all variables except for waiting time and fuel exhaustion." /></v-chip>
      </div>
      <div v-if="request" class="pt-4 px-2">
        <p v-if="isFluid(request.part)">
          Fluids in their liquid form cannot be transported via Drone. Please convert them into their packaged version (if possible).
        </p>
        <drone-calculator v-else :factory-settings="factorySettings" :request="request" />
      </div>
    </v-col>
    <!-- Truck -->
    <v-col class="border-e-md pa-0 d-flex flex-column" cols="12" md="3">
      <div class="border-b text-center py-2">
        <div class="d-flex align-center text-h6 justify-center">
          <game-asset subject="truck" type="vehicle" />
          <span class="ml-2">Truck</span>
          <tooltip-info text="It is assumed you are using <b>one</b> pair of truck stations, with no intermediate stops,  the trucks are fully loaded and fuelled efficiently.<br>Note: This calculation is an <b>estimation</b> due to variables such as queueing time at stations, vehicle collisions, mis-routing, traffic, etc." />
        </div>
        <v-chip color="amber" density="compact">Ok accuracy <tooltip-info text="Highly subject to the game's ability to handle the player's recordings, with inconsistencies often occurring resulting in delays.<br>Also subject to traffic, acceleration forces and even creature collisions when near the player." /></v-chip>
      </div>
      <div v-if="request" class="pt-4 px-2">
        <p v-if="isFluid(request.part)">
          Fluids in their liquid form cannot be transported via Truck. Please convert them into their packaged version (if possible).
        </p>
        <truck-calculator v-else :factory-settings="factorySettings" :request="request" />
      </div>
    </v-col>
    <!-- Tractor -->
    <v-col class="pa-0 d-flex flex-column" cols="12" md="3">
      <div class="border-b text-center py-2">
        <div class="d-flex align-center text-h6 justify-center">
          <game-asset subject="tractor" type="vehicle" />
          <span class="ml-2">Tractor</span>
          <tooltip-info text="It is assumed you are using <b>one</b> pair of truck stations, with no intermediate stops,  the tractors are fully loaded and fuelled efficiently.<br>Note: This calculation is an <b>estimation</b> due to variables such as queueing time at stations, vehicle collisions, mis-routing, traffic, etc." />
        </div>
        <v-chip color="amber" density="compact">Ok accuracy <tooltip-info text="Highly subject to the game's ability to perform the player's recordings, with inconsistencies often occurring resulting in delays.<br>Also subject to traffic, acceleration forces and even creature collisions when near the player." /></v-chip>
      </div>
      <div v-if="request" class="pt-4 px-2">
        <p v-if="isFluid(request.part)">
          Fluids in their liquid form cannot be transported via Tractor. Please convert them into their packaged version (if possible).
        </p>
        <tractor-calculator v-else :factory-settings="factorySettings" :request="request" />
      </div>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { getPartExportRequestByRequestingFactory } from '@/utils/factory-management/exports'
  import TrainCalculator from '@/components/planner/satisfaction/calculator/TrainCalculator.vue'
  import { useGameDataStore } from '@/stores/game-data-store'

  const props = defineProps<{
    factory: Factory
    part: string
  }>()

  const gameData = useGameDataStore().getGameData()

  const calculatorSettings = props.factory.exportCalculator[props.part]

  const selectedFactory = calculatorSettings.selected
  const factorySettings = selectedFactory ? calculatorSettings.factorySettings[selectedFactory] : null

  // Filter the dependency requests by requestedFactoryId to get the actual request
  const request = selectedFactory
    ? getPartExportRequestByRequestingFactory(props.factory, props.part, Number(selectedFactory))
    : null

  const isFluid = (part: string) => {
    return gameData.items.parts[part].isFluid
  }

</script>
