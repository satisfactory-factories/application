<!-- The import side of the rail network: this factory's stations and every train that arrives at
     them, from whichever factory sends it. This is where a station's throughput shows: what each
     platform receives against what its belts can clear between docks. Trains are edited on the
     export they carry; here they are read-only. -->
<template>
  <v-card v-if="visible" class="mb-4 border-md sub-card receiving-stations">
    <v-card-title class="d-flex flex-wrap align-center ga-2">
      <span><i class="fas fa-train" /><span class="ml-2">Train stations</span></span>
      <v-spacer />
      <v-btn
        color="primary"
        prepend-icon="fas fa-plus"
        size="small"
        variant="outlined"
        @click="adding = true"
      >Add station</v-btn>
    </v-card-title>
    <v-card-text class="text-body-2">
      <p v-if="stations.length === 0" class="no-station pa-3">
        Imports arrive here by train, but {{ factory.name }} has no receiving station yet. Add the one they unload at.
      </p>

      <div v-for="station in stations" :key="station.id" class="station-card pa-3 mb-3">
        <div class="d-flex align-center mb-2">
          <v-btn
            v-if="collapsed.has(station.id)"
            key="expand"
            density="comfortable"
            icon="fas fa-chevron-right"
            size="small"
            title="Show this station"
            variant="text"
            @click="toggle(station.id)"
          />
          <v-btn
            v-else
            key="collapse"
            density="comfortable"
            icon="fas fa-chevron-down"
            size="small"
            title="Collapse this station"
            variant="text"
            @click="toggle(station.id)"
          />
          <span class="font-weight-bold ml-1">{{ station.name }}</span>
          <span class="text-medium-emphasis ml-3">{{ summary(flowOf(station.id)) }}</span>
        </div>

        <template v-if="!collapsed.has(station.id)">
          <train-station-header :factory="factory" :flow="flowOf(station.id)" :station="station" />

          <p v-if="!flowOf(station.id)?.incoming.length" class="text-medium-emphasis mt-3">
            No trains arrive here yet. Choose Train on an export into {{ factory.name }} to add one.
          </p>

          <div v-for="arrival in flowOf(station.id)?.incoming ?? []" :key="arrival.train.id" class="train mt-3">
            <div class="d-flex align-center flex-wrap ga-3 mb-2">
              <span class="font-weight-bold">{{ arrival.train.name }}</span>
              <span class="text-medium-emphasis">from {{ arrival.origin.name }}, {{ arrival.loadingStation.name }}</span>
              <span class="text-medium-emphasis">{{ roundTrip(arrival.train.roundTripSecs) }}</span>
            </div>
            <train-consist :flow="arrival" :platform-count="station.platforms.length" :train="arrival.train" />
          </div>

          <template v-if="flowOf(station.id)?.incoming.length">
            <div class="rail-slot-row mt-3" :style="slotGridStyle(station.platforms.length)">
              <div class="rail-totals-label">Delivered</div>
              <div
                v-for="platform in flowOf(station.id)!.platforms"
                :key="platform.index"
                class="rail-total"
                :class="{ 'rail-overloaded': platform.overloaded }"
                :title="`Its belts can clear ${formatNumber(platform.clearPerMin, 0)}/min`"
              >
                {{ formatNumber(platform.unloadPerMin + platform.loadPerMin, 0) }}/min
              </div>
            </div>
            <div class="mt-3">
              <div class="text-medium-emphasis">{{ lockLine(flowOf(station.id)!) }}</div>
              <div class="mt-1">
                <span :key="roomClass(flowOf(station.id)!)" class="rail-room-dot mr-1" :class="roomClass(flowOf(station.id)!)"><i class="fas fa-circle" /></span>{{ roomLine(flowOf(station.id)!) }}
              </div>
            </div>
          </template>
        </template>
      </div>
    </v-card-text>

    <add-train-station-dialog v-model="adding" :amount="trainImportAmount" :factory="factory" />
  </v-card>
</template>

<script setup lang="ts">
  import { computed, inject, reactive, ref } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { formatRoundTrip, getExportSettings, StationFlow, stationKey } from '@/utils/factory-management/train-logistics'
  import { useRailNetwork } from '@/composables/useRailNetwork'
  import { slotGridStyle } from '@/components/planner/satisfaction/calculator/train-layout'
  import TrainStationHeader from '@/components/planner/satisfaction/calculator/TrainStationHeader.vue'
  import TrainConsist from '@/components/planner/satisfaction/calculator/TrainConsist.vue'
  import AddTrainStationDialog from '@/components/planner/satisfaction/calculator/AddTrainStationDialog.vue'
  import { formatNumber } from '@/utils/numberFormatter'

  const props = defineProps<{
    factory: Factory
  }>()

  const findFactory = inject('findFactory') as (factoryId: string | number) => Factory | undefined
  const { network } = useRailNetwork()

  const stations = computed(() => props.factory.trainStations ?? [])

  // Imports whose exporter has chosen Train for them.
  const trainImports = computed(() => props.factory.inputs.filter(input => {
    if (input.factoryId === null || !input.outputPart) return false
    const producer = findFactory(input.factoryId)
    return producer ? getExportSettings(producer, input.outputPart, props.factory.id)?.method === 'train' : false
  }))
  const trainImportAmount = computed(() => trainImports.value.reduce((sum, input) => sum + input.amount, 0))

  const visible = computed(() => stations.value.length > 0 || trainImports.value.length > 0)

  // View state only: collapsing writes nothing to the plan.
  const collapsed = reactive(new Set<string>())
  const toggle = (stationId: string) => collapsed.has(stationId) ? collapsed.delete(stationId) : collapsed.add(stationId)

  const adding = ref(false)

  const flowOf = (stationId: string): StationFlow | undefined => network.value.stations[stationKey(props.factory.id, stationId)]

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

  const summary = (flow?: StationFlow) => {
    if (!flow) return ''
    const overloaded = flow.platforms.filter(platform => platform.overloaded).length
    const trains = plural(flow.incoming.length, 'train') + ' arriving'
    return overloaded ? `${trains}, ${plural(overloaded, 'platform')} cannot keep up` : trains
  }

  const roundTrip = (secs: number) => secs > 0 ? `${formatRoundTrip(secs)} round trip` : 'round trip not timed'

  const lockLine = (flow: StationFlow) => {
    const clear = flow.platforms.find(platform => platform.type !== 'empty')?.clearPerMin ?? 0
    return flow.station.buffered
      ? `Buffered: docking trains do not stall the belts, so each platform can clear ${formatNumber(clear, 0)}/min`
      : `Docking trains lock the station ${Math.round(flow.lockShare * 100)}% of each minute, so each platform can clear ${formatNumber(clear, 0)}/min`
  }

  const roomLine = (flow: StationFlow) => {
    const room = flow.roomForTrains
    if (room === null) return 'Time a train to see how many this station can take'
    if (room > 0) return `Room for ${plural(room, 'more train')} before extra trains slow this station down`
    if (room === 0) return 'At its peak: another train would slow this station down'
    return 'Past its peak: more trains are slowing this station down. Add a second station instead.'
  }

  const roomClass = (flow: StationFlow) => {
    if (flow.roomForTrains === null) return 'rail-room-unknown'
    return flow.roomForTrains >= 0 ? 'rail-room-ok' : 'rail-room-over'
  }
</script>

<style lang="scss" src="@/components/planner/satisfaction/calculator/train-layout.scss" />

<style lang="scss" scoped>
.no-station {
  border: 1px solid var(--sf-status-warning-border);
  border-radius: 8px;
  background-color: color-mix(in srgb, var(--sf-status-warning-border) 15%, transparent);
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
</style>
