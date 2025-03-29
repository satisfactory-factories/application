<template>
  <div
    v-for="group in item.buildingGroups"
    :key="group.id"
    class="buildingGroup"
    :class="isLast(group, item.buildingGroups) ? 'last' : ''"
  >
    <BuildingGroupComponent
      :building="building"
      :factory="factory"
      :group="group"
      :item="item"
    />
  </div>
  <div class="mb-2 d-flex align-center">
    <div class="mr-2">
      <span :class="{ 'text-green': correct, 'text-red': !correct }">
        <i class="fas fa-building" />
        <span class="ml-1">
          Effective Buildings: <b><span :id="`${factory.id}-${item.id}-effective-buildings`">
            {{ effectiveBuildings.toFixed(2) }}
          </span></b>
          |
          <span
            :id="`${factory.id}-${item.id}-buildings-remaining`"
            :key="`${factory.id}-${item.id}-buildings-remaining-${buildingsRemaining}`"
          >
            {{ Math.abs(buildingsRemaining).toFixed(2) }}
            <span v-show="buildingsRemaining > 0">needed</span>
            <span v-show="buildingsRemaining < 0">short</span>
          </span>

        </span>
      </span>
    </div>
    <div>
      <v-chip v-if="over" class="sf-chip red small">
        <i class="fas fa-exclamation-triangle" /><span class="ml-2">Over producing!</span>
      </v-chip>
      <v-chip v-if="under" class="sf-chip red small">
        <i class="fas fa-exclamation-triangle" /><span class="ml-2">Under producing!</span>
      </v-chip>
      <v-chip v-if="!under && !over" class="sf-chip green small">
        <i class="fas fa-check" /><span class="ml-2">Looking good Pioneer!</span>
      </v-chip>
    </div>
    <div class="mr-2">|</div>
    <div class="mr-2">
      <span class="mr-2">Sync status <tooltip-info
        :is-caption="true"
        text="When Sync is enabled, the product is automatically updated with the total of the Building Groups, easing the user burden on doing math.<br>When a new building group is added, sync is disabled to prevent overriding the product's target while you are making adjustments.<br>When a new product is created, it is enabled automatically upon creation.<br>When building groups are reduced to 1, it is re-enabled.<br><br>It is synced in two ways:<br>1. When the <b>product</b> is updated, the building groups are updated <b>and rebalanced</b>.<br>2. When a <b>building group</b> is updated, the building counts are totalled across all groups and applied to the product."
      /></span>
      <v-btn
        v-if="item.buildingGroupItemSync"
        :id="`${factory.id}-${item.id}-toggle-sync`"
        color="green"
        size="small"
        variant="flat"
        @click="item.buildingGroupItemSync = false"
      >
        Enabled
      </v-btn>
      <v-btn
        v-if="!item.buildingGroupItemSync"
        :id="`${factory.id}-${item.id}-toggle-sync`"
        color="amber"
        size="small"
        variant="flat"
        @click="item.buildingGroupItemSync = true"
      >
        Disabled
      </v-btn>
    </div>
    <div class="mr-2">|</div>
    <v-btn color="primary" size="small" variant="flat" @click="showTutorial">
      <v-icon icon="fas fa-graduation-cap" />
      <span class="ml-2">Show Tutorial</span>
    </v-btn>
  </div>
  <div class="d-flex align-center">
    <v-btn
      :id="`${factory.id}-add-building-group`"
      color="primary"
      size="small"
      @click="addBuildingGroup(item, type, factory)"
    >
      <i class="fas fa-plus" />
      <span class="ml-2">Add Building Group</span>
    </v-btn>
    <v-btn
      class="ml-2"
      color="secondary"
      :disabled="item.buildingGroups.length === 1 || correct"
      size="small"
      :variant="item.buildingGroups.length === 1 || correct ? 'outlined' : 'flat'"
      @click="rebalance()"
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
      @click="remainderToLast(item, type, factory)"
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
      @click="remainderToNewGroup(item, type, factory)"
    >
      <i class="fas fa-stream" />
      <span class="ml-2">Remainder to new group <tooltip-info :is-caption="false" text="Creates a new group and automatically applies the Effective Buildings remainder to it." /></span>
    </v-btn>
    <v-btn
      class="ml-2"
      color="amber"
      :disabled="areAllClocks100(item.buildingGroups)"
      size="small"
      :variant="areAllClocks100(item.buildingGroups) ? 'outlined' : 'flat'"

      @click="resetClocks(item.buildingGroups)"
    >
      <i class="fas fa-history" />
      <span class="ml-2">OC @ 100% <tooltip-info :is-caption="false" text="Sets all clocks in all groups to 100%." /></span>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
  import {
    BuildingGroup,
    Factory,
    FactoryItem,
    FactoryPowerProducer,
    ItemType,
  } from '@/interfaces/planner/FactoryInterface'
  import { formatNumberFully } from '@/utils/numberFormatter'
  import eventBus from '@/utils/eventBus'
  import {
    addBuildingGroup,
    calculateEffectiveBuildingCount, calculateRemainingBuildingCount,
    rebalanceBuildingGroups,
    remainderToLast,
    remainderToNewGroup,
  } from '@/utils/factory-management/building-groups/common'
  import BuildingGroupComponent from '@/components/planner/products/BuildingGroup.vue'

  const props = defineProps<{
    factory: Factory
    item: FactoryItem | FactoryPowerProducer
    building: string
    type: ItemType
  }>()

  watch(() => props.item.buildingGroups, () => {
    recalculateMetrics(props.factory)
  }, { deep: true })

  const buildingsRemaining = ref(0)
  const effectiveBuildings = ref(0)

  const recalculateMetrics = (factory: Factory) => {
    // Filter out events for factories we don't care about
    if (factory.id === props.factory.id) {
      calculateEffectiveBuildings()
      calculateBuildingsRemaining()
      console.log('BuildingGroups: Metrics recalculated', props.item.id, props.factory.name)
    }
  }

  const calculateEffectiveBuildings = () => {
    effectiveBuildings.value = formatNumberFully(calculateEffectiveBuildingCount(props.item.buildingGroups))
  }

  const calculateBuildingsRemaining = () => {
    console.log('BuildingGroups: calculateBuildingsRemaining', props.item.id, props.item)
    buildingsRemaining.value = calculateRemainingBuildingCount(props.item, props.type)
  }

  const correct = computed(() => {
    return buildingsRemaining.value <= 0.1 && buildingsRemaining.value >= -0.1
  })

  const over = computed(() => {
    return buildingsRemaining.value < -0.1
  })

  const under = computed(() => {
    return buildingsRemaining.value > 0.1
  })

  const rebalance = () => {
    rebalanceBuildingGroups(
      props.item,
      props.type,
      props.factory
    )
  }

  const resetClocks = (buildingGroups: BuildingGroup[]) => {
    buildingGroups.forEach(group => {
      group.overclockPercent = 100
    })
  }

  const areAllClocks100 = (buildingGroups: BuildingGroup[]) => {
    return buildingGroups.every(group => group.overclockPercent === 100)
  }

  const showTutorial = () => {
    eventBus.emit('openBuildingGroupTutorial')
  }

  const isLast = (group: BuildingGroup, groups: BuildingGroup[]) => {
    return groups.indexOf(group) === groups.length - 1
  }

  eventBus.on('factoryUpdated', recalculateMetrics)
</script>

<style scoped lang="scss">
  .buildingGroup {
    padding-bottom: 0.25rem;
    margin-bottom: 0.25rem;
    border-bottom: 1px solid #4b4b4b;

    &.last {
      border-bottom: none !important;
      padding-bottom: 0 !important;
    }
  }
</style>
