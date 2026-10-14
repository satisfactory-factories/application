<!-- One station in the Train tab, collapsible like a building group. Platforms run across and
     every train unloading here is a row beneath them, other exports' trains included, so the
     platform totals add up. Cars sit under the platform they stop at. -->
<template>
  <div class="train-station mb-3" :data-station-id="station.id">
    <div class="station-header d-flex align-center flex-wrap ga-3 px-3 py-2">
      <!-- Two buttons rather than one flipping its icon: FA swaps the <i> for an <svg> and detaches it. -->
      <v-btn
        v-if="collapsed"
        key="expand"
        density="comfortable"
        icon="fas fa-chevron-right"
        size="small"
        title="Show this station"
        variant="text"
        @click="collapsed = false"
      />
      <v-btn
        v-else
        key="collapse"
        density="comfortable"
        icon="fas fa-chevron-down"
        size="small"
        title="Collapse this station"
        variant="text"
        @click="collapsed = true"
      />
      <v-text-field
        v-model="station.name"
        class="station-name"
        density="compact"
        hide-details
        variant="plain"
        @update:model-value="edited"
      />
      <template v-if="collapsed">
        <span class="text-body-2 text-medium-emphasis">{{ summary }}</span>
      </template>
      <template v-else>
        <div class="d-flex align-center">
          <span class="text-caption text-medium-emphasis mr-1">Platforms</span>
          <v-btn
            density="compact"
            icon="fas fa-minus"
            size="x-small"
            variant="text"
            @click="changePlatforms(-1)"
          />
          <span class="platform-count">{{ station.platforms.length }}</span>
          <v-btn
            density="compact"
            icon="fas fa-plus"
            size="x-small"
            variant="text"
            @click="changePlatforms(1)"
          />
        </div>
        <div class="d-flex align-center ga-1">
          <span class="text-caption text-medium-emphasis">Belts</span>
          <v-select
            v-model="station.beltsPerPlatform"
            class="compact-select"
            density="compact"
            hide-details
            :items="[1, 2]"
            variant="outlined"
            @update:model-value="edited"
          />
          <span class="text-caption">&times;</span>
          <v-select
            v-model="station.beltMark"
            class="compact-select"
            density="compact"
            hide-details
            :items="beltMarks"
            variant="outlined"
            @update:model-value="edited"
          />
        </div>
        <v-switch
          v-model="station.buffered"
          color="primary"
          density="compact"
          hide-details
          label="Buffered"
          title="Containers on the platform belts, so a docking train no longer stalls them"
          @update:model-value="edited"
        />
        <v-chip v-for="problem in problems" :key="problem" class="sf-chip x-small status-warning-outlined" size="small">
          {{ problem }}
        </v-chip>
      </template>
      <v-spacer />
      <v-menu>
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            density="comfortable"
            icon="fas fa-trash"
            size="small"
            title="Delete this station"
            variant="text"
          />
        </template>
        <v-list density="compact">
          <v-list-item @click="deleteStation">
            <v-list-item-title>Delete {{ station.name }} and its {{ station.trains.length }} trains</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div v-if="!collapsed" class="station-body px-3 pb-3">
      <div class="station-grid" :style="gridStyle">
        <!-- Header row: the station as built. -->
        <div />
        <div class="slot-label station-slot">Station</div>
        <v-menu v-for="(type, index) in station.platforms" :key="`platform-${index}`">
          <template #activator="{ props: menuProps }">
            <button v-bind="menuProps" class="slot-label platform-slot" :class="`platform-${type}`" type="button">
              P{{ index + 1 }}<span v-if="type !== 'freight'" class="text-caption ml-1">{{ type }}</span>
            </button>
          </template>
          <v-list density="compact">
            <v-list-item v-for="option in platformTypes" :key="option" @click="setPlatformType(index, option)">
              <v-list-item-title class="text-capitalize">{{ option }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <div class="slot-label text-left pl-2">Round trip</div>

        <!-- One row per train. -->
        <template v-for="(trainFlow, trainIndex) in flow.trains" :key="trainFlow.train.id">
          <div class="train-name">
            <v-text-field
              v-model="station.trains[trainIndex].name"
              density="compact"
              hide-details
              variant="plain"
              @update:model-value="edited"
            />
            <div class="text-caption" :class="carriesThisExport(trainFlow.train) ? 'text-primary' : 'text-medium-emphasis'">
              {{ trainSources(trainFlow.train) }}
            </div>
          </div>

          <v-menu :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <button v-bind="menuProps" class="cell loco-cell" type="button">
                {{ trainFlow.train.locomotives > 1 ? `${trainFlow.train.locomotives} locos` : 'Loco' }}
              </button>
            </template>
            <v-card class="pa-2">
              <div class="d-flex align-center ga-1">
                <span class="text-body-2 mr-2">Locomotives</span>
                <v-btn
                  density="compact"
                  icon="fas fa-minus"
                  size="x-small"
                  variant="text"
                  @click="changeLocos(trainFlow.train, -1)"
                />
                <span>{{ trainFlow.train.locomotives }}</span>
                <v-btn
                  density="compact"
                  icon="fas fa-plus"
                  size="x-small"
                  variant="text"
                  @click="changeLocos(trainFlow.train, 1)"
                />
              </div>
            </v-card>
          </v-menu>

          <template v-for="(_, platformIndex) in station.platforms" :key="`${trainFlow.train.id}-${platformIndex}`">
            <div v-if="platformIndex < trainFlow.train.locomotives - 1" class="cell loco-cell">Loco</div>
            <v-menu v-else-if="carAt(trainFlow, platformIndex)">
              <template #activator="{ props: menuProps }">
                <button
                  v-bind="menuProps"
                  class="cell car-cell"
                  :class="carClass(carAt(trainFlow, platformIndex)!)"
                  type="button"
                >
                  <template v-if="carAt(trainFlow, platformIndex)!.cargo">
                    <span class="car-part">{{ getPartDisplayName(carAt(trainFlow, platformIndex)!.cargo!.part) }}</span>
                    <span class="car-rate">{{ formatNumber(carAt(trainFlow, platformIndex)!.deliveredPerMin, 0) }}/min</span>
                  </template>
                  <template v-else>
                    <span class="car-empty">empty</span>
                    <span class="car-hint">pick cargo</span>
                  </template>
                </button>
              </template>
              <v-list density="compact">
                <v-list-item
                  v-for="option in cargoOptions"
                  :key="option.key"
                  @click="setCargo(trainFlow.train, carAt(trainFlow, platformIndex)!.carIndex, option.cargo)"
                >
                  <v-list-item-title>{{ option.label }}</v-list-item-title>
                </v-list-item>
                <v-list-item @click="setCargo(trainFlow.train, carAt(trainFlow, platformIndex)!.carIndex, null)">
                  <v-list-item-title>Empty</v-list-item-title>
                </v-list-item>
                <v-divider />
                <v-list-item
                  :disabled="trainFlow.train.cars.length <= 1"
                  @click="removeCar(trainFlow.train, carAt(trainFlow, platformIndex)!.carIndex)"
                >
                  <v-list-item-title>Remove car</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
            <button
              v-else-if="platformIndex === trainFlow.train.locomotives - 1 + trainFlow.train.cars.length"
              class="cell add-car-cell"
              title="Add a car"
              type="button"
              @click="addCar(trainFlow.train)"
            >
              <i class="fas fa-plus" />
            </button>
            <div v-else />
          </template>

          <div class="d-flex align-center ga-1">
            <train-round-trip :train="station.trains[trainIndex]" @edited="edited" />
            <v-btn
              density="comfortable"
              icon="fas fa-times"
              size="x-small"
              title="Remove this train"
              variant="text"
              @click="deleteTrain(trainFlow.train.id)"
            />
          </div>
        </template>

        <!-- Totals: what each platform receives against what its belts can clear. -->
        <template v-if="flow.trains.length > 0">
          <div class="font-weight-bold totals-label">Delivered per platform</div>
          <div />
          <div
            v-for="platform in flow.platforms"
            :key="`total-${platform.index}`"
            class="platform-total"
            :class="{ overloaded: platform.overloaded }"
            :title="`Its belts can clear ${formatNumber(platform.clearPerMin, 0)}/min`"
          >
            {{ formatNumber(platform.deliveredPerMin, 0) }}/min
          </div>
          <div />
        </template>
      </div>

      <div class="d-flex align-center ga-3 mt-2">
        <v-btn
          color="primary"
          prepend-icon="fas fa-plus"
          size="small"
          variant="outlined"
          @click="newTrain"
        >Add train</v-btn>
        <span class="text-caption text-medium-emphasis">A new train copies the first train's round trip.</span>
      </div>

      <div v-if="flow.trains.length > 0" class="text-body-2 mt-3">
        <div class="text-medium-emphasis">{{ lockLine }}</div>
        <div class="mt-1">
          <span :key="roomClass" class="room-dot mr-1" :class="roomClass"><i class="fas fa-circle" /></span>{{ roomLine }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, inject, ref } from 'vue'
  import { Factory, Train, TrainCarCargo, TrainPlatformType, TrainStation } from '@/interfaces/planner/FactoryInterface'
  import {
    addTrain,
    addTrainCar,
    CarFlow,
    cargoKey,
    removeTrain,
    removeTrainCar,
    removeTrainStation,
    setStationPlatformCount,
    setTrainCarCargo,
    setTrainLocomotives,
    StationFlow,
    TrainFlow,
  } from '@/utils/factory-management/train-logistics'
  import TrainRoundTrip from '@/components/planner/satisfaction/calculator/TrainRoundTrip.vue'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    station: TrainStation
    flow: StationFlow
    consumer: Factory
    producer: Factory
    part: string
    fallbackRoundTripSecs: number
  }>()

  const findFactory = inject('findFactory') as (factoryId: string | number) => Factory | undefined

  // View state only: never stored on the station, so collapsing writes nothing to the plan.
  const collapsed = ref(false)

  const beltMarks = [1, 2, 3, 4, 5, 6].map(mark => ({ title: `Mk.${mark}`, value: mark }))
  const platformTypes: TrainPlatformType[] = ['freight', 'fluid', 'empty']

  const edited = () => markFactoryEdited(props.consumer)

  const ownKey = computed(() => cargoKey({ factoryId: props.producer.id, part: props.part }))

  const cargoOptions = computed(() => {
    const seen = new Map<string, { key: string, cargo: TrainCarCargo, label: string }>()
    props.consumer.inputs.forEach(input => {
      if (input.factoryId === null || input.factoryId === undefined || !input.outputPart) return
      const cargo = { factoryId: Number(input.factoryId), part: input.outputPart }
      const key = cargoKey(cargo)
      if (!seen.has(key)) seen.set(key, { key, cargo, label: cargoLabel(cargo) })
    })
    return [...seen.values()]
  })

  const sourceName = (factoryId: number) => findFactory(factoryId)?.name ?? `Factory #${factoryId}`

  const cargoLabel = (cargo: TrainCarCargo) => `${sourceName(cargo.factoryId)}: ${getPartDisplayName(cargo.part)}`

  const carriesThisExport = (train: Train) => train.cars.some(car => car.cargo && cargoKey(car.cargo) === ownKey.value)

  const trainSources = (train: Train) => {
    if (carriesThisExport(train)) return 'this export'
    const sources = new Set(train.cars.filter(car => car.cargo).map(car => cargoLabel(car.cargo!)))
    return sources.size ? [...sources].join(', ') : 'no cargo yet'
  }

  const carAt = (trainFlow: TrainFlow, platformIndex: number): CarFlow | undefined =>
    trainFlow.cars.find(car => car.platformIndex === platformIndex)

  const carClass = (car: CarFlow) => ({
    'car-own': car.cargo && cargoKey(car.cargo) === ownKey.value,
    'car-empty-cell': !car.cargo,
  })

  const gridStyle = computed(() => ({
    gridTemplateColumns: `minmax(170px, 1fr) repeat(${props.station.platforms.length + 1}, 84px) 210px`,
  }))

  const problems = computed(() => {
    const list: string[] = []
    const overloaded = props.flow.platforms.filter(platform => platform.overloaded).length
    if (props.flow.emptyCars) list.push(`${props.flow.emptyCars} empty car${props.flow.emptyCars === 1 ? '' : 's'}`)
    if (props.flow.overhangingCars) list.push(`${props.flow.overhangingCars} car${props.flow.overhangingCars === 1 ? '' : 's'} past the last platform`)
    if (overloaded) list.push(`${overloaded} platform${overloaded === 1 ? '' : 's'} cannot keep up`)
    return list
  })

  const summary = computed(() => {
    const trains = `${props.station.trains.length} train${props.station.trains.length === 1 ? '' : 's'}`
    return problems.value.length ? `${trains}, ${problems.value.join(', ')}` : `${trains}, every platform keeps up`
  })

  const lockLine = computed(() => {
    const clear = props.flow.platforms.find(platform => platform.type !== 'empty')?.clearPerMin ?? 0
    if (props.station.buffered) {
      return `Buffered: docking trains do not stall the belts, so each platform can clear ${formatNumber(clear, 0)}/min`
    }
    return `Docking trains lock the station ${Math.round(props.flow.lockShare * 100)}% of each minute, so each platform can clear ${formatNumber(clear, 0)}/min`
  })

  const roomLine = computed(() => {
    const room = props.flow.roomForTrains
    if (room === null) return 'Time a train to see how many this station can take'
    if (room > 0) return `Room for ${room} more train${room === 1 ? '' : 's'} before extra trains slow this station down`
    if (room === 0) return 'At its peak: another train would slow this station down'
    return 'Past its peak: more trains are slowing this station down. Add a second station instead.'
  })

  const roomClass = computed(() => {
    const room = props.flow.roomForTrains
    if (room === null) return 'room-unknown'
    return room >= 0 ? 'room-ok' : 'room-over'
  })

  const changePlatforms = (delta: number) => {
    setStationPlatformCount(props.station, props.station.platforms.length + delta)
    edited()
  }

  const setPlatformType = (index: number, type: TrainPlatformType) => {
    props.station.platforms[index] = type
    edited()
  }

  const changeLocos = (train: Train, delta: number) => {
    setTrainLocomotives(train, train.locomotives + delta)
    edited()
  }

  const setCargo = (train: Train, carIndex: number, cargo: TrainCarCargo | null) => {
    setTrainCarCargo(train.cars[carIndex], cargo)
    edited()
  }

  const addCar = (train: Train) => {
    addTrainCar(train)
    edited()
  }

  const removeCar = (train: Train, carIndex: number) => {
    removeTrainCar(train, carIndex)
    edited()
  }

  const newTrain = () => {
    addTrain(props.station, {
      name: `${props.producer.name} train`,
      cargo: { factoryId: props.producer.id, part: props.part },
      fallbackRoundTripSecs: props.fallbackRoundTripSecs,
    })
    edited()
  }

  const deleteTrain = (trainId: string) => {
    removeTrain(props.station, trainId)
    edited()
  }

  const deleteStation = () => {
    removeTrainStation(props.consumer, props.station.id)
    edited()
  }
</script>

<style lang="scss" scoped>
.train-station {
  border: thin solid #4b4b4b;
  border-radius: 8px;
}

.station-name {
  flex: 0 1 200px;
  font-weight: 600;
}

.compact-select {
  flex: 0 0 auto;
  min-width: 84px;
}

.platform-count {
  min-width: 2ch;
  text-align: center;
}

.station-body {
  overflow-x: auto;
}

.station-grid {
  align-items: center;
  display: grid;
  gap: 6px;
  min-width: max-content;
}

.slot-label {
  border: thin solid #7f7f7f;
  border-radius: 4px;
  font-size: 12px;
  padding: 4px 0;
  text-align: center;
}

.station-slot {
  background-color: rgba(255, 255, 255, 0.08);
}

.platform-slot {
  color: inherit;
  cursor: pointer;

  &.platform-empty {
    border-style: dashed;
    opacity: 0.6;
  }

  &.platform-fluid {
    border-color: var(--sf-raw-resource-border);
  }
}

.cell {
  align-items: center;
  border: thin solid #7f7f7f;
  border-radius: 6px;
  color: inherit;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  height: 46px;
  justify-content: center;
}

.loco-cell {
  background-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.car-cell {
  background-color: rgba(255, 255, 255, 0.04);
  cursor: pointer;

  &.car-own {
    border-color: rgb(var(--v-theme-primary));
    background-color: rgba(var(--v-theme-primary), 0.12);
  }

  &.car-empty-cell {
    border: 2px dashed rgb(var(--v-theme-primary));
  }
}

.car-part {
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  max-width: 78px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.car-rate {
  font-weight: 600;
}

.car-empty {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.car-hint {
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
}

.add-car-cell {
  border-style: dashed;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.platform-total {
  font-weight: 600;
  text-align: center;

  &.overloaded {
    color: var(--sf-error);
  }
}

.room-dot {
  font-size: 8px;
  vertical-align: middle;

  &.room-ok {
    color: var(--sf-success);
  }

  &.room-over {
    color: var(--sf-status-warning);
  }

  &.room-unknown {
    color: rgba(255, 255, 255, 0.4);
  }
}
</style>
