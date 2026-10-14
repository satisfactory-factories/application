<!-- The Train tab: the receiving factory's stations, each with every train that unloads there.
     Stations live on the receiving factory, so every edit here is an edit of that factory. The
     planner never creates a station by itself; until one exists, this asks for one. -->
<template>
  <div v-if="consumer" class="train-stations">
    <div v-if="stations.length === 0" class="no-station d-flex align-center flex-wrap ga-3 pa-3 mb-3">
      <i class="fas fa-exclamation-circle" />
      <div>
        <div class="font-weight-bold">No destination station at {{ consumer.name }}</div>
        <div class="text-body-2">Add one to send this export by train.</div>
      </div>
    </div>

    <train-station-section
      v-for="(stationFlow, index) in rail.stations"
      :key="stationFlow.station.id"
      :consumer="consumer"
      :fallback-round-trip-secs="factorySettings.trainTime"
      :flow="stationFlow"
      :part="part"
      :producer="producer"
      :station="stations[index]"
    />

    <v-btn
      class="mt-1"
      color="primary"
      prepend-icon="fas fa-plus"
      size="small"
      :variant="stations.length === 0 ? 'tonal' : 'outlined'"
      @click="openAddStation"
    >
      Add station
    </v-btn>

    <app-dialog v-model="addStationOpen" icon="fas fa-train" max-width="440" title="Add station">
      <v-text-field
        v-model="newStationName"
        autofocus
        class="mb-2"
        density="compact"
        hide-details
        label="Name"
        variant="outlined"
      />
      <div class="d-flex align-center ga-2">
        <span class="mr-2">Platforms</span>
        <v-btn
          density="comfortable"
          icon="fas fa-minus"
          size="small"
          variant="text"
          @click="newStationPlatforms = Math.max(1, newStationPlatforms - 1)"
        />
        <span class="text-h6 platform-count">{{ newStationPlatforms }}</span>
        <v-btn
          density="comfortable"
          icon="fas fa-plus"
          size="small"
          variant="text"
          @click="newStationPlatforms += 1"
        />
      </div>
      <p class="text-caption text-medium-emphasis mt-2">
        Suggested from this export's {{ formatNumber(request.amount) }}/min: {{ suggestion.platforms }} platforms on Mk.{{ suggestion.beltMark }} belts.
      </p>
      <template #actions>
        <v-btn variant="text" @click="addStationOpen = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="confirmAddStation">Add</v-btn>
      </template>
    </app-dialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, inject, ref } from 'vue'
  import { ExportCalculatorFactorySettings, Factory, FactoryDependencyRequest } from '@/interfaces/planner/FactoryInterface'
  import { addTrainStation, analyseRail, suggestStationLayout } from '@/utils/factory-management/train-logistics'
  import TrainStationSection from '@/components/planner/satisfaction/calculator/TrainStationSection.vue'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { formatNumber } from '@/utils/numberFormatter'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    producer: Factory
    part: string
    request: FactoryDependencyRequest
    factorySettings: ExportCalculatorFactorySettings
  }>()

  const gameData = useGameDataStore().getGameData()
  const findFactory = inject('findFactory') as (factoryId: string | number) => Factory | undefined

  const consumer = computed(() => findFactory(props.request.requestingFactoryId))
  const stations = computed(() => consumer.value?.trainStations ?? [])
  const rail = computed(() => consumer.value ? analyseRail(consumer.value, gameData) : { stations: [], cargo: {} })

  const suggestion = computed(() => suggestStationLayout(props.request.amount))
  const addStationOpen = ref(false)
  const newStationName = ref('')
  const newStationPlatforms = ref(4)

  const openAddStation = () => {
    newStationName.value = `Station ${String.fromCharCode(65 + stations.value.length)}`
    newStationPlatforms.value = suggestion.value.platforms
    addStationOpen.value = true
  }

  const confirmAddStation = () => {
    if (!consumer.value) return
    addTrainStation(consumer.value, {
      name: newStationName.value,
      platforms: newStationPlatforms.value,
      beltMark: suggestion.value.beltMark,
    })
    markFactoryEdited(consumer.value)
    addStationOpen.value = false
  }
</script>

<style lang="scss" scoped>
.no-station {
  border: 1px solid var(--sf-status-warning-border);
  border-radius: 8px;
  background-color: color-mix(in srgb, var(--sf-status-warning-border) 15%, transparent);

  .fas {
    color: var(--sf-status-warning);
    font-size: 20px;
  }
}

.platform-count {
  min-width: 2ch;
  text-align: center;
}
</style>
