<template>
  <div class="export-calculator">
    <div v-if="!selectedFactory" class="d-flex flex-column justify-center py-8">
      <p class="text-h6 align-self-center">
        Please select a factory from the buttons above in Exports.
      </p>
    </div>
    <template v-if="selectedFactory && factorySettings">
      <v-row class="ma-0">
        <!-- Train -->
        <v-col class="method-col pa-0 d-flex flex-column" cols="12" md="3">
          <div class="method-header text-center py-2">
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
        <v-col class="method-col pa-0 d-flex flex-column" :class="{ 'method-col--disabled': isFluidExport }" cols="12" md="3">
          <div class="method-header text-center py-2">
            <div class="d-flex align-center text-h6 justify-center">
              <game-asset subject="drone" type="vehicle" />
              <span class="ml-2">Drone</span>
              <tooltip-info text="It is assumed you are using <b>one</b> pair of drone stations, and that there is no waiting time.<br>If you have a significant amount of waiting time, you should create more port pairs. As long as pairs are geographically near each other, this calculator will be accurate.<br>It is practically impossible to calculate waiting time, so reducing it will make this calculator more accurate." />
            </div>
            <v-chip color="blue" density="compact">Excellent accuracy <tooltip-info text="Extremely accurate as drones are based on a 'flight on rails' system,<br> disregarding terrain and all variables except for waiting time and fuel exhaustion." /></v-chip>
          </div>
          <div v-if="request" class="pt-4 px-2">
            <p v-if="isFluidExport">
              Drones cannot transport fluids in their liquid form. Package them first — packaged fluids are solids and travel as regular cargo.
            </p>
            <drone-calculator v-else :factory-settings="factorySettings" :request="request" />
          </div>
        </v-col>
        <!-- Truck -->
        <v-col class="method-col pa-0 d-flex flex-column" cols="12" md="3">
          <div class="method-header text-center py-2">
            <div class="d-flex align-center text-h6 justify-center">
              <game-asset :subject="isFluidExport ? 'fluid-truck' : 'truck'" type="vehicle" />
              <span class="ml-2">Truck</span>
              <tooltip-info text="It is assumed you are using <b>one</b> pair of truck stations, with no intermediate stops,  the trucks are fully loaded and fuelled efficiently.<br>Note: This calculation is an <b>estimation</b> due to variables such as queueing time at stations, vehicle collisions, mis-routing, traffic, etc." />
            </div>
            <v-chip color="amber" density="compact">Ok accuracy <tooltip-info text="Highly subject to the game's ability to handle the player's recordings, with inconsistencies often occurring resulting in delays.<br>Also subject to traffic, acceleration forces and even creature collisions when near the player." /></v-chip>
          </div>
          <div v-if="request" class="pt-4 px-2">
            <truck-calculator :factory-settings="factorySettings" :request="request" />
          </div>
        </v-col>
        <!-- Tractor -->
        <v-col class="method-col pa-0 d-flex flex-column" :class="{ 'method-col--disabled': isFluidExport }" cols="12" md="3">
          <div class="method-header text-center py-2">
            <div class="d-flex align-center text-h6 justify-center">
              <game-asset subject="tractor" type="vehicle" />
              <span class="ml-2">Tractor</span>
              <tooltip-info text="It is assumed you are using <b>one</b> pair of truck stations, with no intermediate stops,  the tractors are fully loaded and fuelled efficiently.<br>Note: This calculation is an <b>estimation</b> due to variables such as queueing time at stations, vehicle collisions, mis-routing, traffic, etc." />
            </div>
            <v-chip color="amber" density="compact">Ok accuracy <tooltip-info text="Highly subject to the game's ability to perform the player's recordings, with inconsistencies often occurring resulting in delays.<br>Also subject to traffic, acceleration forces and even creature collisions when near the player." /></v-chip>
          </div>
          <div v-if="request" class="pt-4 px-2">
            <p v-if="isFluidExport">
              Tractors cannot transport fluids in their liquid form. Package them first — packaged fluids are solids and travel as regular cargo.
            </p>
            <tractor-calculator v-else :factory-settings="factorySettings" :request="request" />
          </div>
        </v-col>
      </v-row>
      <!-- Belts (solids) -->
      <div v-if="request && !isFluidExport" class="belt-section">
        <div class="method-header text-center py-2">
          <div class="d-flex align-center text-h6 justify-center">
            <game-asset subject="conveyor-belt-mk-5" type="building" />
            <span class="ml-2">Belts</span>
            <tooltip-info text="Shows how many belts of the chosen mark it takes to carry this export.<br>Add more belt groups to split the load across multiple belts (e.g. via splitters), mixing belt marks as you wish." />
          </div>
          <v-chip color="green" density="compact">Perfect accuracy <tooltip-info text="Belts move items at a constant rate, so the calculation is exact." /></v-chip>
        </div>
        <div class="pt-2 px-2">
          <belt-pipe-calculator :factory-settings="factorySettings" kind="belts" :request="request" />
        </div>
      </div>
      <!-- Pipes (fluids) -->
      <div v-if="request && isFluidExport" class="belt-section">
        <div class="method-header text-center py-2">
          <div class="d-flex align-center text-h6 justify-center">
            <game-asset subject="pipeline-mk-2" type="building" />
            <span class="ml-2">Pipes</span>
            <tooltip-info text="Shows how many pipelines of the chosen mark it takes to carry this export.<br>Add more pipe groups to split the load across multiple pipelines (e.g. via junctions), mixing marks as you wish." />
          </div>
          <v-chip color="green" density="compact">Perfect accuracy <tooltip-info text="Pipelines move fluids at a constant rate, so the calculation is exact." /></v-chip>
        </div>
        <div class="pt-2 px-2">
          <belt-pipe-calculator :factory-settings="factorySettings" kind="pipes" :request="request" />
        </div>
      </div>
    </template>
  </div>
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

  const isFluidExport = request ? isFluid(request.part) : false

</script>

<style lang="scss" scoped>
// One divider colour throughout, matching the satisfaction table's row lines.
$divider: thin solid #4b4b4b;

.export-calculator {
  // Recessed tray: darker than the table it drops out of, with an inset "lip" top and bottom.
  background: rgba(0, 0, 0, 0.35);
  box-shadow: inset 0 10px 8px -8px rgba(0, 0, 0, 0.55), inset 0 -10px 8px -8px rgba(0, 0, 0, 0.55);
  padding: 12px 0 16px;
}

.method-col--disabled {
  // Transport methods that cannot carry the selected (fluid) export.
  opacity: 0.45;
}

.method-col + .method-col {
  // Stacked on small screens, side by side from md up — divider follows suit.
  border-top: $divider;

  @media (min-width: 960px) {
    border-top: none;
    border-left: $divider;
  }
}

.belt-section {
  border-top: $divider;
}
</style>
