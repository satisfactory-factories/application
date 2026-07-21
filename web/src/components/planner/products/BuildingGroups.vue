<template>
  <!-- Alien Power Augmenters are always synced and have no clocks, so the balancing
       actions and sync/effective-buildings status are pure noise for them. -->
  <div v-if="!isAlwaysSynced" class="mb-2 d-flex align-center">
    <v-btn
      :id="`${factory.id}-${item.id}-evenly-balance`"
      color="secondary"
      :disabled="item.buildingGroups.length === 1 || isEvenlyBalanced"
      size="small"
      :variant="item.buildingGroups.length === 1 || isEvenlyBalanced ? 'outlined' : 'flat'"
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
    <v-btn
      class="ml-auto"
      color="primary"
      size="small"
      variant="flat"
      @click="showTutorial"
    >
      <v-icon icon="fas fa-graduation-cap" />
      <span class="ml-2">Help</span>
    </v-btn>
  </div>
  <div v-if="!isAlwaysSynced" class="mb-2 d-flex align-center">
    <div class="mr-2">
      <span :id="`${factory.id}-${item.id}-buildings-status`" :class="{ 'text-green': correct, 'text-red': !correct }">
        <i class="fas fa-building" />
        <span class="ml-1">
          Effective Buildings: <b><span :id="`${factory.id}-${item.id}-effective-buildings`">
            {{ effectiveBuildings.toFixed(2) }}
          </span></b>
          |
          <span
            :id="`${factory.id}-${item.id}-remaining-buildings`"
            :key="`${factory.id}-${item.id}-remaining-buildings-${buildingsRemaining}`"
          >
            {{ Math.abs(buildingsRemaining).toFixed(2) }}
          </span>
          <span v-if="buildingsRemaining > 0" :id="`${factory.id}-${item.id}-remaining-buildings-verb`"> short</span>
          <span v-if="buildingsRemaining < 0" :id="`${factory.id}-${item.id}-remaining-buildings-verb`"> over</span>
        </span>
      </span>
    </div>
    <div :id="`${factory.id}-${item.id}-buildings-status-indicator`" class="ml-2" :isRed="over || under">
      <v-chip v-if="over" class="sf-chip red small">
        <i class="fas fa-exclamation-triangle" /><span class="ml-2">Over producing!</span>
      </v-chip>
      <v-chip v-if="under" class="sf-chip red small">
        <i class="fas fa-exclamation-triangle" /><span class="ml-2">Under producing!</span>
      </v-chip>
      <v-chip v-if="!under && !over" class="sf-chip green small">
        <i class="fas fa-check" /><span class="ml-2">Balanced</span>
      </v-chip>
    </div>
    <div class="mr-2">|</div>
    <div class="mr-2">
      <span class="mr-2">Sync:</span>
      <v-btn
        :id="`${factory.id}-${item.id}-toggle-sync`"
        :color="item.buildingGroupItemSync ? 'green' : 'amber'"
        size="small"
        variant="flat"
        @click="item.buildingGroupItemSync = !item.buildingGroupItemSync"
      >
        {{ item.buildingGroupItemSync ? 'Enabled' : 'Disabled' }}
      </v-btn>
      <span><tooltip-info
        :is-caption="true"
        text="Sync keeps this item and its Building Groups aligned:<br>• Editing the <b>item</b> rebalances the groups evenly.<br>• Editing a <b>group</b> updates the item's totals.<br><br>Adding a second group turns sync off so your manual adjustments aren't overwritten (it stays off after deleting groups).<br>Re-enable it any time to restore automatic syncing."
      /></span>
    </div>
  </div>
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
  <div class="d-flex justify-center mb-2">
    <v-btn
      :id="`${factory.id}-add-building-group`"
      color="primary"
      @click="addBuildingGroup(item, type, factory)"
    >
      <i class="fas fa-plus" />
      <span class="ml-2">Add Building Group</span>
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
  import { isAlwaysSyncedBuilding } from '@/utils/factory-management/common'
  import {
    addBuildingGroup,
    calculateEffectiveBuildingCount,
    calculateRemainingBuildingCount,
    remainderToLast,
    remainderToNewGroup,
    syncBuildingGroups,
  } from '@/utils/factory-management/building-groups/common'
  import BuildingGroupComponent from '@/components/planner/products/BuildingGroup.vue'

  const props = defineProps<{
    factory: Factory
    item: FactoryItem | FactoryPowerProducer
    building: string
    type: ItemType
  }>()

  const buildingsRemaining = ref(0)
  const effectiveBuildings = ref(0)

  const calculateEffectiveBuildings = () => {
    effectiveBuildings.value = formatNumberFully(calculateEffectiveBuildingCount(props.item.buildingGroups, props.building))
  }

  const calculateBuildingsRemaining = () => {
    console.log('BuildingGroups: calculateBuildingsRemaining', props.item.id, props.item)
    buildingsRemaining.value = calculateRemainingBuildingCount(props.item, props.type)
  }

  const recalculateMetrics = (factory: Factory) => {
    // Filter out events for factories we don't care about
    if (factory.id === props.factory.id) {
      calculateEffectiveBuildings()
      calculateBuildingsRemaining()
      console.log('BuildingGroups: Metrics recalculated', props.item.id, props.factory.name)
    }
  }

  watch(() => props.item.buildingGroups, () => {
    recalculateMetrics(props.factory)
  }, { deep: true, immediate: true })

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
    syncBuildingGroups(
      props.item,
      props.type,
      props.factory,
      { forceRebalance: true }
    )
  }

  const resetClocks = (buildingGroups: BuildingGroup[]) => {
    buildingGroups.forEach(group => {
      group.overclockPercent = 100
      group.clockSetByUser = false
    })
  }

  const areAllClocks100 = (buildingGroups: BuildingGroup[]) => {
    return buildingGroups.every(group => group.overclockPercent === 100)
  }

  const isEvenlyBalanced = computed(() => {
    if (props.item.buildingGroups.length <= 1) return true
    const first = props.item.buildingGroups[0]
    return props.item.buildingGroups.every(g =>
      g.buildingCount === first.buildingCount &&
      g.overclockPercent === first.overclockPercent
    )
  })

  const showTutorial = () => {
    eventBus.emit('openBuildingGroupTutorial')
  }

  const isLast = (group: BuildingGroup, groups: BuildingGroup[]) => {
    return groups.indexOf(group) === groups.length - 1
  }

  const isAlwaysSynced = computed(() => isAlwaysSyncedBuilding(props.building))

  eventBus.on('factoryUpdated', recalculateMetrics)

  // These components mount and unmount every time the plan is hidden/shown (e.g. on a tab
  // switch), so the listener must be torn down or it leaks. mitt does not dedup handlers, so
  // leaked listeners accumulate and every factoryUpdated emit fires all of them — the main
  // driver of the escalating recalculation cost.
  onUnmounted(() => {
    eventBus.off('factoryUpdated', recalculateMetrics)
  })
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
