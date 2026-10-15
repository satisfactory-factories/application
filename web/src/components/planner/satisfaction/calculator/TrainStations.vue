<!-- The Train tab: a route from a loading station at this factory to a receiving station at the
     factory importing the export, and the trains that run it. Trains are kept on the loading
     station, so editing one is an edit of this factory. The planner never creates a station by
     itself; until one exists at either end, this asks for one. -->
<template>
  <div v-if="consumer" class="train-route">
    <div class="d-flex flex-wrap ga-4">
      <section class="route-end">
        <div class="route-end-title"><i class="fas fa-sign-out-alt mr-2" />Loads at {{ producer.name }}</div>
        <div v-if="producerStations.length === 0" class="no-station pa-3">
          <div class="font-weight-bold">No loading station at {{ producer.name }}</div>
          <div class="text-body-2 mb-2">Add the station this export leaves from.</div>
          <v-btn
            color="primary"
            prepend-icon="fas fa-plus"
            size="small"
            variant="tonal"
            @click="addingAt = 'producer'"
          >Add station</v-btn>
        </div>
        <div v-else class="d-flex align-center ga-2">
          <v-select
            class="station-pick"
            density="compact"
            hide-details
            item-title="name"
            item-value="id"
            :items="producerStations"
            label="Loading station"
            :model-value="loading?.id"
            variant="outlined"
            @update:model-value="(id: string) => (loadingId = id)"
          />
          <v-btn prepend-icon="fas fa-plus" size="small" variant="text" @click="addingAt = 'producer'">Add station</v-btn>
        </div>
      </section>

      <section class="route-end">
        <div class="route-end-title"><i class="fas fa-sign-in-alt mr-2" />Unloads at {{ consumer.name }}</div>
        <div v-if="consumerStations.length === 0" class="no-station pa-3">
          <div class="font-weight-bold">No receiving station at {{ consumer.name }}</div>
          <div class="text-body-2 mb-2">Add the station this export arrives at.</div>
          <v-btn
            color="primary"
            prepend-icon="fas fa-plus"
            size="small"
            variant="tonal"
            @click="addingAt = 'consumer'"
          >Add station</v-btn>
        </div>
        <template v-else>
          <div class="d-flex align-center ga-2">
            <v-select
              class="station-pick"
              density="compact"
              hide-details
              item-title="name"
              item-value="id"
              :items="consumerStations"
              label="Receiving station"
              :model-value="receiving?.id"
              variant="outlined"
              @update:model-value="(id: string) => (receivingId = id)"
            />
            <v-btn prepend-icon="fas fa-plus" size="small" variant="text" @click="addingAt = 'consumer'">Add station</v-btn>
          </div>
          <div v-if="receivingFlow" class="text-caption text-medium-emphasis mt-1">
            {{ receivingSummary }}. Its platforms are on {{ consumer.name }}'s imports.
          </div>
        </template>
      </section>
    </div>

    <template v-if="loading">
      <div class="station-card mt-4 pa-3">
        <train-station-header :factory="producer" :flow="loadingFlow" :station="loading" />

        <div v-for="train in routeTrains" :key="train.id" class="train mt-3">
          <div class="d-flex align-center flex-wrap ga-3 mb-1">
            <v-text-field
              v-model="train.name"
              class="train-name"
              density="compact"
              hide-details
              label="Train name"
              variant="outlined"
              @update:model-value="edited"
            />
            <div class="d-flex align-center ga-1">
              <span class="text-caption text-medium-emphasis">Round trip</span>
              <train-round-trip :train="train" @edited="edited" />
            </div>
            <v-select
              class="station-pick"
              density="compact"
              hide-details
              item-title="name"
              item-value="id"
              :items="consumerStations"
              label="Unloads at"
              :model-value="train.destination?.factoryId === consumer.id ? train.destination.stationId : null"
              variant="outlined"
              @update:model-value="(stationId: string) => setDestination(train, stationId)"
            />
            <v-btn prepend-icon="fas fa-trash" size="small" variant="text" @click="deleteTrain(train.id)">Delete train</v-btn>
          </div>
          <div class="text-caption text-medium-emphasis mb-2">{{ trainSummary(train) }}</div>
          <train-consist
            editable
            :flow="trainFlow(train)"
            :own-part="part"
            :part-options="partOptions"
            :platform-count="loading.platforms.length"
            :train="train"
            @edited="edited"
          />
        </div>

        <div v-if="loadingFlow && routeTrains.length" class="rail-slot-row mt-3" :style="slotGridStyle(loading.platforms.length)">
          <div class="rail-totals-label">Loaded</div>
          <div
            v-for="platform in loadingFlow.platforms"
            :key="platform.index"
            class="rail-total"
            :class="{ 'rail-overloaded': platform.overloaded }"
            :title="`Its belts can fill ${formatNumber(platform.clearPerMin, 0)}/min`"
          >
            {{ formatNumber(platform.loadPerMin + platform.unloadPerMin, 0) }}/min
          </div>
        </div>

        <div class="d-flex align-center flex-wrap ga-3 mt-3">
          <v-btn
            color="primary"
            :disabled="!receiving"
            prepend-icon="fas fa-plus"
            size="small"
            variant="outlined"
            @click="newTrain"
          >
            Add train
          </v-btn>
          <span class="text-caption text-medium-emphasis">
            {{ receiving ? `New trains run to ${receiving.name} and copy the first train's round trip.` : 'Add a receiving station first.' }}
          </span>
        </div>

        <div class="text-body-2 mt-3">
          <div v-if="exportFlow">
            Trains on this route carry {{ formatNumber(exportFlow.delivered, 0) }} of the {{ formatNumber(exportFlow.requested, 0) }}/min asked for<span v-if="exportFlow.short > 0.5">, {{ formatNumber(exportFlow.short, 0) }}/min short</span>.
          </div>
          <div v-if="loadingFlow && loadingFlow.outgoing.length" class="text-medium-emphasis">{{ lockLine(loadingFlow) }}</div>
        </div>
      </div>
    </template>

    <add-train-station-dialog
      v-model="addingProducer"
      :amount="request.amount"
      :factory="producer"
      @created="station => (loadingId = station.id)"
    />
    <add-train-station-dialog
      v-model="addingConsumer"
      :amount="request.amount"
      :factory="consumer"
      @created="station => (receivingId = station.id)"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, inject, ref } from 'vue'
  import { ExportCalculatorFactorySettings, Factory, FactoryDependencyRequest, Train } from '@/interfaces/planner/FactoryInterface'
  import {
    addTrain,
    removeTrain,
    routeKey,
    setTrainDestination,
    StationFlow,
    stationKey,
  } from '@/utils/factory-management/train-logistics'
  import { useRailNetwork } from '@/composables/useRailNetwork'
  import { slotGridStyle } from '@/components/planner/satisfaction/calculator/train-layout'
  import TrainStationHeader from '@/components/planner/satisfaction/calculator/TrainStationHeader.vue'
  import TrainConsist from '@/components/planner/satisfaction/calculator/TrainConsist.vue'
  import TrainRoundTrip from '@/components/planner/satisfaction/calculator/TrainRoundTrip.vue'
  import AddTrainStationDialog from '@/components/planner/satisfaction/calculator/AddTrainStationDialog.vue'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    producer: Factory
    part: string
    request: FactoryDependencyRequest
    factorySettings: ExportCalculatorFactorySettings
  }>()

  const findFactory = inject('findFactory') as (factoryId: string | number) => Factory | undefined
  const { network } = useRailNetwork()

  const consumer = computed(() => findFactory(props.request.requestingFactoryId))
  const producerStations = computed(() => props.producer.trainStations ?? [])
  const consumerStations = computed(() => consumer.value?.trainStations ?? [])

  // Start on the stations an existing train on this route already uses.
  const existingRoute = props.producer.trainStations?.flatMap(station => station.trains.map(train => ({ station, train })))
    .find(({ train }) => train.destination?.factoryId === props.request.requestingFactoryId)
  const loadingId = ref<string | null>(existingRoute?.station.id ?? null)
  const receivingId = ref<string | null>(existingRoute?.train.destination?.stationId ?? null)

  const loading = computed(() => producerStations.value.find(station => station.id === loadingId.value) ?? producerStations.value[0])
  const receiving = computed(() => consumerStations.value.find(station => station.id === receivingId.value) ?? consumerStations.value[0])

  // Trains from this loading station to the importing factory, and any not yet given a destination.
  const routeTrains = computed(() => (loading.value?.trains ?? []).filter(train =>
    !train.destination || train.destination.factoryId === consumer.value?.id))

  const loadingFlow = computed(() => loading.value ? network.value.stations[stationKey(props.producer.id, loading.value.id)] : undefined)
  const receivingFlow = computed(() => consumer.value && receiving.value
    ? network.value.stations[stationKey(consumer.value.id, receiving.value.id)]
    : undefined)
  const exportFlow = computed(() => consumer.value ? network.value.exports[routeKey(props.producer.id, consumer.value.id, props.part)] : undefined)

  // A car only carries what this factory sends to the importing factory.
  const partOptions = computed(() => [...new Set((consumer.value?.inputs ?? [])
    .filter(input => input.factoryId === props.producer.id && input.outputPart)
    .map(input => input.outputPart!))]
    .map(part => ({ part, label: getPartDisplayName(part) })))

  const addingAt = ref<'producer' | 'consumer' | null>(null)
  const addingProducer = computed({
    get: () => addingAt.value === 'producer',
    set: open => { addingAt.value = open ? 'producer' : null },
  })
  const addingConsumer = computed({
    get: () => addingAt.value === 'consumer',
    set: open => { addingAt.value = open ? 'consumer' : null },
  })

  const edited = () => markFactoryEdited(props.producer)

  const trainFlow = (train: Train) => network.value.trains.find(flow => flow.train.id === train.id)

  const trainSummary = (train: Train) => {
    const parts = [...new Set(train.cars.filter(car => car.part).map(car => getPartDisplayName(car.part)))]
    const cargo = parts.length ? `Carries ${parts.join(', ')}` : 'Carries nothing yet'
    return train.destination ? cargo : `${cargo}. Pick the station it unloads at.`
  }

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

  const receivingSummary = computed(() => {
    const flow = receivingFlow.value
    if (!flow) return ''
    return `${plural(flow.station.platforms.length, 'platform')}, ${plural(flow.incoming.length, 'train')} arriving, locked ${Math.round(flow.lockShare * 100)}% of each minute`
  })

  const lockLine = (flow: StationFlow) =>
    `Docking trains lock ${flow.station.name} ${Math.round(flow.lockShare * 100)}% of each minute`

  const newTrain = () => {
    if (!loading.value || !receiving.value || !consumer.value) return
    addTrain(loading.value, {
      name: `${props.producer.name} train ${loading.value.trains.length + 1}`,
      part: props.part,
      destination: { factoryId: consumer.value.id, stationId: receiving.value.id },
      fallbackRoundTripSecs: props.factorySettings.trainTime,
    })
    edited()
  }

  const setDestination = (train: Train, stationId: string | null) => {
    setTrainDestination(train, stationId && consumer.value ? { factoryId: consumer.value.id, stationId } : null)
    edited()
  }

  const deleteTrain = (trainId: string) => {
    if (!loading.value) return
    removeTrain(loading.value, trainId)
    edited()
  }
</script>

<style lang="scss" src="./train-layout.scss" />

<style lang="scss" scoped>
.route-end {
  flex: 1 1 320px;
}

.route-end-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.no-station {
  border: 1px solid var(--sf-status-warning-border);
  border-radius: 8px;
  background-color: color-mix(in srgb, var(--sf-status-warning-border) 15%, transparent);
}

.station-pick {
  flex: 0 0 220px;
}

.station-card {
  border: thin solid #4b4b4b;
  border-radius: 8px;
  overflow-x: auto;
}

.train {
  border-top: thin solid #3a3a3a;
  padding-top: 12px;
}

.train-name {
  flex: 0 0 240px;
}
</style>
