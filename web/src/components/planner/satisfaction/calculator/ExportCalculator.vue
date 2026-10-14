<template>
  <div class="export-calculator">
    <div v-if="!selectedFactory" class="d-flex flex-column justify-center py-8">
      <p class="text-h6 align-self-center">
        Please select a factory from the buttons above in Exports.
      </p>
    </div>
    <template v-if="selectedFactory && factorySettings && request">
      <!-- One method per export. Unset shows no tab chosen; a guess shows its tab, marked as a guess. -->
      <div class="d-flex align-center flex-wrap ga-3 px-4 pb-3">
        <v-btn-toggle
          class="method-tabs"
          color="primary"
          density="comfortable"
          divided
          :model-value="transport.method"
          variant="outlined"
          @update:model-value="chooseMethod"
        >
          <v-btn
            v-for="option in methodOptions"
            :key="option.value"
            :class="{ guessed: guessed && transport.method === option.value }"
            :disabled="option.disabled"
            :value="option.value"
          >
            <game-asset height="24" :subject="option.asset" :type="option.assetType" width="24" />
            <span class="ml-2">{{ option.label }}</span>
          </v-btn>
        </v-btn-toggle>
        <span v-if="guessed" class="text-body-2 method-note">
          <i class="fas fa-question-circle mr-1" />Guessed from a time in the old calculator. Choose a method to confirm it.
        </span>
        <span v-else-if="!transport.method" class="text-body-2 method-note">
          <i class="fas fa-question-circle mr-1" />Transport not set. Choose how this export travels.
        </span>
      </div>

      <div v-if="transport.method === 'train'" class="method-body px-4">
        <train-stations :factory-settings="factorySettings" :part="part" :producer="factory" :request="request" />
      </div>

      <div v-else-if="transport.method === 'drone'" class="method-body px-4">
        <p v-if="isFluidExport">
          Drones cannot transport fluids in their liquid form. Package them first; packaged fluids are solids and travel as regular cargo.
        </p>
        <drone-calculator v-else :factory-settings="factorySettings" :request="request" />
      </div>

      <div v-else-if="transport.method === 'truck'" class="method-body px-4">
        <truck-calculator :factory="factory" :factory-settings="factorySettings" :request="request" />
      </div>

      <div v-else-if="transport.method === 'tractor'" class="method-body px-4">
        <p v-if="isFluidExport">
          Tractors cannot transport fluids in their liquid form. Package them first; packaged fluids are solids and travel as regular cargo.
        </p>
        <tractor-calculator v-else :factory="factory" :factory-settings="factorySettings" :request="request" />
      </div>

      <div v-else-if="transport.method === 'belt'" class="method-body px-4">
        <belt-pipe-calculator :factory="factory" :factory-settings="factorySettings" :kind="isFluidExport ? 'pipes' : 'belts'" :request="request" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, inject } from 'vue'
  import { ExportTransportMethod, Factory } from '@/interfaces/planner/FactoryInterface'
  import { getPartExportRequestByRequestingFactory } from '@/utils/factory-management/exports'
  import { exportTransport, setExportTransportMethod } from '@/utils/factory-management/train-logistics'
  import TrainStations from '@/components/planner/satisfaction/calculator/TrainStations.vue'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    factory: Factory
    part: string
  }>()

  const gameData = useGameDataStore().getGameData()
  const findFactory = inject('findFactory') as (factoryId: string | number) => Factory | undefined

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

  const transport = computed(() => exportTransport(
    props.factory,
    props.part,
    selectedFactory ? findFactory(selectedFactory) : undefined,
    gameData,
  ))

  const guessed = computed(() => transport.value.state === 'guessed')

  const methodOptions = computed(() => [
    isFluidExport
      ? { value: 'belt', label: 'Pipe', asset: 'pipeline-mk-2', assetType: 'building', disabled: false }
      : { value: 'belt', label: 'Belt', asset: 'conveyor-belt-mk-5', assetType: 'building', disabled: false },
    { value: 'train', label: 'Train', asset: 'electric-locomotive', assetType: 'vehicle', disabled: false },
    { value: 'drone', label: 'Drone', asset: 'drone', assetType: 'vehicle', disabled: isFluidExport },
    { value: 'truck', label: 'Truck', asset: isFluidExport ? 'fluid-truck' : 'truck', assetType: 'vehicle', disabled: false },
    { value: 'tractor', label: 'Tractor', asset: 'tractor', assetType: 'vehicle', disabled: isFluidExport },
  ] as { value: ExportTransportMethod, label: string, asset: string, assetType: 'building' | 'vehicle', disabled: boolean }[])

  // Choosing a tab is the player saying how it travels, which also confirms a guess. Clicking the
  // chosen tab again leaves it chosen: a method is changed, never cleared.
  const chooseMethod = (method: ExportTransportMethod | null | undefined) => {
    if (!method || !selectedFactory) return
    setExportTransportMethod(props.factory, props.part, Number(selectedFactory), method)
    markFactoryEdited(props.factory)
  }
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

.method-body {
  border-top: $divider;
  padding-top: 12px;
}

.method-note {
  color: var(--sf-status-warning);
}

.method-tabs .guessed {
  border-style: dashed !important;
}
</style>
