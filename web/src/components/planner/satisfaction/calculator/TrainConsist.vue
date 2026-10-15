<!-- One train drawn against a station's platforms: the locomotive at the station building and each
     car under the platform it stops at. Editable on the export side, where the train is kept; the
     receiving side shows the same row read-only. -->
<template>
  <div class="rail-slot-row" :style="slotGridStyle(platformCount)">
    <v-menu v-if="editable" :close-on-content-click="false">
      <template #activator="{ props: menuProps }">
        <button v-bind="menuProps" class="rail-cell rail-loco-cell" title="Change the number of locomotives" type="button">
          {{ locoLabel }}
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
            @click="changeLocos(-1)"
          />
          <span>{{ train.locomotives }}</span>
          <v-btn
            density="compact"
            icon="fas fa-plus"
            size="x-small"
            variant="text"
            @click="changeLocos(1)"
          />
        </div>
      </v-card>
    </v-menu>
    <div v-else class="rail-cell rail-loco-cell">{{ locoLabel }}</div>

    <template v-for="platformIndex in platformCount" :key="platformIndex">
      <div v-if="platformIndex - 1 < train.locomotives - 1" class="rail-cell rail-loco-cell">Loco</div>
      <template v-else-if="carIndexAt(platformIndex - 1) < train.cars.length">
        <v-menu v-if="editable">
          <template #activator="{ props: menuProps }">
            <button
              v-bind="menuProps"
              class="rail-cell rail-car-cell rail-editable"
              :class="carClass(carIndexAt(platformIndex - 1))"
              type="button"
            >
              <car-contents :car="train.cars[carIndexAt(platformIndex - 1)]" editable :rate="rate(carIndexAt(platformIndex - 1))" />
            </button>
          </template>
          <v-list density="compact">
            <v-list-item v-for="option in partOptions" :key="option.part" @click="setPart(carIndexAt(platformIndex - 1), option.part)">
              <v-list-item-title>{{ option.label }}</v-list-item-title>
            </v-list-item>
            <v-list-item @click="setPart(carIndexAt(platformIndex - 1), null)">
              <v-list-item-title>Empty</v-list-item-title>
            </v-list-item>
            <v-divider />
            <v-list-item :disabled="train.cars.length <= 1" @click="removeCar(carIndexAt(platformIndex - 1))">
              <v-list-item-title>Remove car</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <div v-else class="rail-cell rail-car-cell" :class="carClass(carIndexAt(platformIndex - 1))">
          <car-contents :car="train.cars[carIndexAt(platformIndex - 1)]" :rate="rate(carIndexAt(platformIndex - 1))" />
        </div>
      </template>
      <button
        v-else-if="editable && carIndexAt(platformIndex - 1) === train.cars.length"
        class="rail-cell rail-add-car"
        title="Add a car"
        type="button"
        @click="addCar"
      >
        <i class="fas fa-plus" />
      </button>
      <div v-else />
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, defineComponent, h } from 'vue'
  import { Train, TrainCar } from '@/interfaces/planner/FactoryInterface'
  import { addTrainCar, removeTrainCar, setTrainCarPart, setTrainLocomotives, TrainFlow } from '@/utils/factory-management/train-logistics'
  import { slotGridStyle } from '@/components/planner/satisfaction/calculator/train-layout'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'

  const props = withDefaults(defineProps<{
    train: Train
    flow?: TrainFlow
    platformCount: number
    editable?: boolean
    partOptions?: { part: string, label: string }[]
    ownPart?: string
  }>(), {
    flow: undefined,
    editable: false,
    partOptions: () => [],
    ownPart: undefined,
  })

  const emit = defineEmits<{
    edited: []
  }>()

  // What a car shows: the part and its rate, or that it is empty.
  const CarContents = defineComponent({
    props: {
      car: { type: Object as () => TrainCar, required: true },
      rate: { type: Number, required: true },
      editable: { type: Boolean, default: false },
    },
    setup (carProps) {
      return () => carProps.car.part
        ? [
          h('span', { class: 'rail-car-part' }, getPartDisplayName(carProps.car.part)),
          h('span', { class: 'rail-car-rate' }, `${formatNumber(carProps.rate, 0)}/min`),
        ]
        : [
          h('span', { class: 'rail-car-empty-label' }, 'empty'),
          carProps.editable ? h('span', { class: 'rail-car-hint' }, 'pick cargo') : null,
        ]
    },
  })

  const locoLabel = computed(() => props.train.locomotives > 1 ? `${props.train.locomotives} locos` : 'Loco')

  const carIndexAt = (platformIndex: number) => platformIndex - (Math.max(1, props.train.locomotives) - 1)

  const rate = (carIndex: number) => props.flow?.cars[carIndex]?.deliveredPerMin ?? 0

  const carClass = (carIndex: number) => {
    const part = props.train.cars[carIndex]?.part
    return {
      'rail-car-own': !!part && part === props.ownPart,
      'rail-car-empty': !part,
    }
  }

  const changeLocos = (delta: number) => {
    setTrainLocomotives(props.train, props.train.locomotives + delta)
    emit('edited')
  }

  const setPart = (carIndex: number, part: string | null) => {
    setTrainCarPart(props.train.cars[carIndex], part)
    emit('edited')
  }

  const addCar = () => {
    addTrainCar(props.train)
    emit('edited')
  }

  const removeCar = (carIndex: number) => {
    removeTrainCar(props.train, carIndex)
    emit('edited')
  }
</script>

<style lang="scss" src="./train-layout.scss" />
