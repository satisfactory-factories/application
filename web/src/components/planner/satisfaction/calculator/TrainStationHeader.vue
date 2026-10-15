<!-- A station's own settings, the same at either end of a route: its name, platforms, belts and
     whether a container buffers them. Edits are edits of the factory the station is built at. -->
<template>
  <div>
    <div class="d-flex align-center flex-wrap ga-3">
      <v-text-field
        v-model="station.name"
        class="station-name"
        density="compact"
        hide-details
        label="Station name"
        variant="outlined"
        @update:model-value="edited"
      />
      <v-select
        class="compact-select"
        density="compact"
        hide-details
        :items="platformCounts"
        label="Platforms"
        :model-value="station.platforms.length"
        variant="outlined"
        @update:model-value="setPlatforms"
      />
      <v-select
        v-model="station.beltsPerPlatform"
        class="compact-select"
        density="compact"
        hide-details
        :items="[1, 2]"
        label="Belts each"
        variant="outlined"
        @update:model-value="edited"
      />
      <v-select
        v-model="station.beltMark"
        class="compact-select"
        density="compact"
        hide-details
        :items="beltMarks"
        label="Belt mark"
        variant="outlined"
        @update:model-value="edited"
      />
      <div class="d-flex align-center">
        <v-switch
          v-model="station.buffered"
          color="primary"
          density="compact"
          hide-details
          label="Buffered"
          @update:model-value="edited"
        />
        <tooltip-info
          class="ml-1"
          text="Has a container buffer: the platform belts run through storage containers.<br>A docking train stops a platform for 27 seconds. Without a buffer its belts stop too; with one they keep moving."
        />
      </div>
      <v-menu>
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps" prepend-icon="fas fa-trash" size="small" variant="text">Delete station</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="deleteStation">
            <v-list-item-title>Delete {{ station.name }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div v-if="problems.length" class="d-flex flex-wrap ga-2 mt-2">
      <v-chip v-for="problem in problems" :key="problem" class="sf-chip x-small status-warning-outlined no-margin" size="small">
        {{ problem }}
      </v-chip>
    </div>

    <!-- The station as built. Every train row below shares these columns. -->
    <div class="rail-slot-row mt-3" :style="slotGridStyle(station.platforms.length)">
      <div class="rail-slot-label rail-station-slot">Station</div>
      <v-menu v-for="(type, index) in station.platforms" :key="`platform-${index}`">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" class="rail-slot-label rail-platform-slot" :class="`rail-platform-${type}`" type="button">
            P{{ index + 1 }}<span v-if="type !== 'freight'" class="text-caption ml-1">{{ type }}</span>
          </button>
        </template>
        <v-list density="compact">
          <v-list-item v-for="option in platformTypes" :key="option" @click="setPlatformType(index, option)">
            <v-list-item-title class="text-capitalize">{{ option }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Factory, TrainPlatformType, TrainStation } from '@/interfaces/planner/FactoryInterface'
  import { removeTrainStation, setStationPlatformCount, StationFlow } from '@/utils/factory-management/train-logistics'
  import { slotGridStyle } from '@/components/planner/satisfaction/calculator/train-layout'
  import TooltipInfo from '@/components/tooltip-info.vue'
  import { useAppStore } from '@/stores/app-store'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    station: TrainStation
    factory: Factory
    flow?: StationFlow
  }>()

  const appStore = useAppStore()

  const beltMarks = [1, 2, 3, 4, 5, 6].map(mark => ({ title: `Mk.${mark}`, value: mark }))
  const platformTypes: TrainPlatformType[] = ['freight', 'fluid', 'empty']

  // Ten covers any station worth planning; a station saved with more keeps its own count.
  const platformCounts = computed(() => {
    const counts = Array.from({ length: 10 }, (_, index) => index + 1)
    return counts.includes(props.station.platforms.length) ? counts : [...counts, props.station.platforms.length]
  })

  const edited = () => markFactoryEdited(props.factory)

  const problems = computed(() => {
    const flow = props.flow
    if (!flow) return []
    const list: string[] = []
    const overloaded = flow.platforms.filter(platform => platform.overloaded).length
    if (flow.emptyCars) list.push(`${flow.emptyCars} empty car${flow.emptyCars === 1 ? '' : 's'}`)
    if (flow.overhangingCars) list.push(`${flow.overhangingCars} car${flow.overhangingCars === 1 ? '' : 's'} past the last platform`)
    if (overloaded) list.push(`${overloaded} platform${overloaded === 1 ? '' : 's'} cannot keep up`)
    return list
  })

  const setPlatforms = (count: number) => {
    setStationPlatformCount(props.station, count)
    edited()
  }

  const setPlatformType = (index: number, type: TrainPlatformType) => {
    props.station.platforms[index] = type
    edited()
  }

  // Trains elsewhere that unloaded here lose their destination, and those factories changed too.
  const deleteStation = () => {
    const changed = removeTrainStation(props.factory, props.station.id, appStore.getFactories())
    edited()
    changed.forEach(factory => markFactoryEdited(factory))
  }
</script>

<style lang="scss" src="./train-layout.scss" />

<style lang="scss" scoped>
.station-name {
  flex: 0 0 220px;
  font-weight: 600;
}

.compact-select {
  flex: 0 0 120px;
}
</style>
