<template>
  <p v-if="!selectedFactory">
    Please select a factory from the buttons above in Exports.
  </p>
  <v-row v-if="selectedFactory && factorySettings" class="ma-0">
    <v-col class="border-e pa-0" cols="12" md="3">
      <div class="d-flex align-center text-h6 border-b justify-center py-2">
        <game-asset subject="electric-locomotive" type="vehicle" />
        <span class="ml-2">Train</span>
        <span class="ml-2 text-caption text-grey">
          <v-tooltip bottom>
            <template #activator="{ props }">
              <span v-bind="props">
                <v-icon
                  icon="fas fa-info-circle"
                />
              </span>
            </template>
            <span>
              This calculator informs you how many train cars you need to service the export request. It can handle freight and fluid car types.<br>
              NOTE: This is an <b>approximation</b>. The round time may differ by traffic conditions, routing and other variables.</span>
          </v-tooltip>
        </span>
      </div>
      <div class="px-2 py-4">
        <train-calculator v-if="request" :factory-settings="factorySettings" :request="request" />
      </div>
    </v-col>
    <v-col class="border-e pa-0" cols="12" md="3">
      <div class="d-flex align-center text-h6 border-b justify-center py-2">
        <game-asset subject="drone" type="vehicle" />
        <span class="ml-2">Drone</span>
        <span class="ml-2 text-caption text-grey">
          <v-tooltip bottom>
            <template #activator="{ props }">
              <span v-bind="props">
                <v-icon
                  icon="fas fa-info-circle"
                />
              </span>
            </template>
            <span>This calculator informs you how many drones you need to service a request.</span>
          </v-tooltip>
        </span>
      </div>
      <div class="px-2 py-4">
        <p>DRONE</p>
      </div>
    </v-col>
    <v-col class="border-e pa-0" cols="12" md="3">
      <div class="d-flex align-center text-h6 border-b justify-center py-2">
        <game-asset subject="truck" type="vehicle" />
        <span class="ml-2">Truck</span>
        <span class="ml-2 text-caption text-grey">
          <v-tooltip bottom>
            <template #activator="{ props }">
              <span v-bind="props">
                <v-icon
                  icon="fas fa-info-circle"
                />
              </span>
            </template>
            <span>TODO</span>
          </v-tooltip>
        </span>
      </div>
      <div class="px-2 py-4">
        <p>TRUCK</p>
      </div>
    </v-col>
    <v-col class="pa-0" cols="12" md="3">
      <div class="d-flex align-center text-h6 border-b justify-center py-2">
        <game-asset subject="tractor" type="vehicle" />
        <span class="ml-2">Tractor</span>
        <span class="ml-2 text-caption text-grey">
          <v-tooltip bottom>
            <template #activator="{ props }">
              <span v-bind="props">
                <v-icon
                  icon="fas fa-info-circle"
                />
              </span>
            </template>
            <span>TTODO</span>
          </v-tooltip>
        </span>
      </div>
      <div class="px-2 py-4">
        <p>TRACTOR</p>
      </div>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { Factory } from '@/interfaces/planner/FactoryInterface'
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
