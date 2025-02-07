<template>
  <div v-for="group in product.buildingGroups" :key="group.id" class="border-t-md py-1">
    <building-group :factory="factory" :group="group" :product="product" />
  </div>
  <div class="mb-2 d-flex align-center">
    <span :class="{ 'text-green': correct }">Effective Buildings: <b>{{ effectiveBuildings }}</b> | {{ buildingsRemaining }} remaining</span>
    <div class="mx-1">
      <span v-if="over" class="text-amber ml-2">Over producing!</span>
      <span v-if="under" class="text-red ml-2">Under producing!</span>
    </div>
    <div class="mx-1">
      <v-chip v-if="product.buildingGroups.length === 1" class="sf-chip small gray">Basic mode</v-chip>
      <v-chip v-if="product.buildingGroups.length > 1" class="sf-chip small gray">Advanced mode</v-chip>
    </div>
    <v-btn color="primary" size="small" variant="flat" @click="showTutorial">Show Tutorial</v-btn>
  </div>
  <div class="d-flex align-center">
    <v-btn
      color="primary"
      size="small"
      @click="addGroup(product, false)"
    >
      <i class="fas fa-plus" />
      <span class="ml-2">Add Building Group</span>
    </v-btn>
    <v-btn
      class="ml-2"
      color="secondary"
      :disabled="product.buildingGroups.length === 1 || correct"
      size="small"
      :variant="product.buildingGroups.length === 1 || correct ? 'outlined' : 'flat'"
      @click="rebalanceGroups(product)"
    >
      <i class="fas fa-balance-scale" />
      <span class="ml-2">Evenly balance <tooltip-info :is-caption="false" text="Attempts to evenly balance all groups for their buildings and clock speeds." /></span>
    </v-btn>
    <v-btn
      class="ml-2"
      color="success"
      :disabled="correct || over"
      size="small"
      :variant="correct || over ? 'outlined' : 'flat'"
      @click="remainderToLast(product)"
    >
      <i class="fas fa-balance-scale-right" />
      <span class="ml-2">Remainder to last <tooltip-info :is-caption="false" text="Attempts to apply the Effective Buildings remainder to the last group.<br>This is useful if you cannot change existing groups and want to make a new one and fulfil changes in demands." /></span>
    </v-btn>
    <v-btn
      class="ml-2"
      color="success"
      :disabled="correct || over"
      size="small"
      :variant="correct || over ? 'outlined' : 'flat'"
      @click="remainderToNewGroup(product)"
    >
      <i class="fas fa-stream" />
      <span class="ml-2">Remainder to new group <tooltip-info :is-caption="false" text="Creates a new group and automatically applies the Effective Buildings remainder to it." /></span>
    </v-btn>
    <v-btn
      class="ml-2"
      color="amber"
      :disabled="areAllClocks100(product)"
      size="small"
      :variant="areAllClocks100(product) ? 'outlined' : 'flat'"

      @click="resetClocks(product)"
    >
      <i class="fas fa-history" />
      <span class="ml-2">OC @ 100% <tooltip-info :is-caption="false" text="Sets all clocks in all groups to 100%." /></span>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
  import BuildingGroup from '@/components/planner/products/BuildingGroup.vue'
  import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
  import {
    addGroup,
    calculateEffectiveBuildingCount,
    rebalanceGroups,
    remainderToLast,
    remainderToNewGroup,
  } from '@/utils/factory-management/productBuildingGroups'
  import { formatNumberFully } from '@/utils/numberFormatter'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{
    factory: Factory
    product: FactoryItem
  }>()

  const effectiveBuildings = computed(() => {
    return formatNumberFully(calculateEffectiveBuildingCount(props.product)).toFixed(2)
  })

  const buildingsRemaining = computed(() => {
    const groupBuildings = calculateEffectiveBuildingCount(props.product)
    return formatNumberFully(props.product.buildingRequirements.amount - groupBuildings)
  })

  const correct = computed(() => {
    return buildingsRemaining.value <= 0.1 && buildingsRemaining.value >= -0.1
  })

  const over = computed(() => {
    return buildingsRemaining.value < -0.1
  })

  const under = computed(() => {
    return buildingsRemaining.value > 0.1
  })

  const resetClocks = (product: FactoryItem) => {
    product.buildingGroups.forEach(group => {
      group.overclockPercent = 100
    })
  }

  const areAllClocks100 = (product: FactoryItem) => {
    return product.buildingGroups.every(group => group.overclockPercent === 100)
  }

  const showTutorial = () => {
    eventBus.emit('openBuildingGroupTutorial')
  }
</script>
