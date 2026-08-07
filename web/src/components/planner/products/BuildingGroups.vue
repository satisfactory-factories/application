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
      <span class="ml-2">Remainder to last <tooltip-info :is-caption="false" :text="`Attempts to apply the ${remainderNoun} to the last group.<br>This is useful if you cannot change existing groups and want to make a new one and fulfil changes in demands.`" /></span>
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
      <span class="ml-2">Remainder to new group <tooltip-info :is-caption="false" :text="`Creates a new group and automatically applies the ${remainderNoun} to it.`" /></span>
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
  <!-- One flex row for the whole status line. Every element is a flex item so it centres
       against the taller controls (chips, the sync button) instead of sitting on the text
       baseline, and a single `ga-3` gives uniform spacing rather than per-element margins. -->
  <div v-if="!isAlwaysSynced" class="mb-2 d-flex align-center flex-wrap ga-3 group-status">
    <span
      :id="`${factory.id}-${item.id}-buildings-status`"
      class="d-flex align-center ga-2"
      :class="{ 'text-green': correct, 'text-red': !correct }"
    >
      <i :class="isExtraction ? 'fas fa-cog' : 'fas fa-building'" />
      <!-- Mines are measured in what they dig up, not in Miner Mk.1 equivalents. -->
      <span v-if="isExtraction">
        Effective Output: <b><span :id="`${factory.id}-${item.id}-effective-output`">
          {{ formatNumber(effectiveOutput) }}/min
        </span></b>
        |
        <span
          :id="`${factory.id}-${item.id}-remaining-output`"
          :key="`${factory.id}-${item.id}-remaining-output-${outputRemaining}`"
        >
          {{ formatNumber(Math.abs(outputRemaining)) }}/min
        </span>
        <span v-if="buildingsRemaining > 0" :id="`${factory.id}-${item.id}-remaining-output-verb`"> short</span>
        <span v-if="buildingsRemaining < 0" :id="`${factory.id}-${item.id}-remaining-output-verb`"> over</span>
      </span>
      <span v-else>
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
    <span
      :id="`${factory.id}-${item.id}-buildings-status-indicator`"
      class="d-flex align-center"
      :isRed="over || under"
    >
      <v-chip v-if="over" class="sf-chip red small no-margin">
        <i class="fas fa-exclamation-triangle" /><span class="ml-2">Over producing!</span>
      </v-chip>
      <v-chip v-if="under" class="sf-chip red small no-margin">
        <i class="fas fa-exclamation-triangle" /><span class="ml-2">Under producing!</span>
      </v-chip>
      <v-chip v-if="!under && !over" class="sf-chip green small no-margin">
        <i class="fas fa-check" /><span class="ml-2">Balanced</span>
      </v-chip>
    </span>
    <span class="text-medium-emphasis">|</span>
    <span class="d-flex align-center ga-2">
      <span>Sync:</span>
      <v-btn
        :id="`${factory.id}-${item.id}-toggle-sync`"
        :color="item.buildingGroupItemSync ? 'green' : 'amber'"
        size="small"
        variant="flat"
        @click="item.buildingGroupItemSync = !item.buildingGroupItemSync"
      >
        {{ item.buildingGroupItemSync ? 'Enabled' : 'Disabled' }}
      </v-btn>
      <tooltip-info
        :is-caption="true"
        text="Sync keeps this item and its Building Groups aligned:<br>• Editing the <b>item</b> rebalances the groups evenly.<br>• Editing a <b>group</b> updates the item's totals.<br><br>Adding a second group turns sync off so your manual adjustments aren't overwritten (it stays off after deleting groups).<br>Re-enable it any time to restore automatic syncing."
      />
    </span>
  </div>
  <!-- What closing the gap would take, per node purity, so the arithmetic across three marks
       and three purities isn't left to the user. Its own row — three pills alongside the
       status line made it far too wide. Extraction only; empty otherwise. -->
  <div
    v-if="shortfallHints.length > 0"
    :id="`${factory.id}-${item.id}-shortfall-hints`"
    class="mb-2 d-flex align-center flex-wrap ga-2 group-status"
  >
    <i class="fas fa-arrow-right text-medium-emphasis" />
    <span class="text-medium-emphasis">To cover the shortfall:</span>
    <v-chip
      v-for="hint in shortfallHints"
      :key="hint.purity"
      class="sf-chip cyan x-small no-margin"
      variant="tonal"
    >
      <i class="fas fa-gem mr-2" />
      <b v-if="hint.showPurity" class="mr-1">{{ hint.label }}:</b>
      <template v-for="(mark, index) in hint.marks" :key="mark.building">
        <span v-if="index > 0" class="mx-1 text-medium-emphasis">|</span>
        <span><template v-if="mark.label">{{ mark.label }}: </template><b>{{ mark.count }}</b></span>
      </template>
    </v-chip>
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
  import { formatNumber, formatNumberFully } from '@/utils/numberFormatter'
  import eventBus from '@/utils/eventBus'
  import { getBuildingDisplayName, isAlwaysSyncedBuilding } from '@/utils/factory-management/common'
  import {
    getExtraction,
    getExtractionReferenceRate,
    isExtractionRecipe,
    PURITY_LABELS,
    PURITY_MULTIPLIERS,
  } from '@/utils/factory-management/building-groups/extraction'
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
    effectiveBuildings.value = formatNumberFully(
      calculateEffectiveBuildingCount(props.item.buildingGroups, props.building, props.item.recipe)
    )
  }

  // Extraction counts its effective buildings in reference-extractor units (Miner Mk.1 on a
  // normal node), so "88 short" means 88 Mk.1-equivalents — meaningless to someone building
  // Mk.3s. Mines report the same figures as output instead: the groups' combined rate against
  // the quantity being asked for.
  const isExtraction = computed(() => isExtractionRecipe(props.item.recipe))

  // The remainder buttons work in buildings either way, but for a mine the figure the user is
  // looking at is output, so name it the way the status line does.
  const remainderNoun = computed(() =>
    isExtraction.value ? 'outstanding output' : 'Effective Buildings remainder'
  )

  const referenceRate = computed(() => getExtractionReferenceRate(props.item.recipe))

  const effectiveOutput = computed(() => formatNumberFully(effectiveBuildings.value * referenceRate.value, 3))
  const outputRemaining = computed(() => formatNumberFully(buildingsRemaining.value * referenceRate.value, 3))

  // How many of each extractor would close the shortfall, for every purity the resource can
  // sit on. Showing all three sidesteps guessing which nodes the user has. Counts are the
  // same building unit the rest of the row uses — one building at 100% — so a gap half a
  // miner wide reads 0.5 rather than being rounded up to a miner that would overshoot it.
  const shortfallHints = computed(() => {
    const extraction = getExtraction(props.item.recipe)
    if (!extraction || outputRemaining.value <= 0) {
      return []
    }

    return extraction.purities.map(purity => ({
      purity,
      label: PURITY_LABELS[purity],
      showPurity: extraction.purities.length > 1,
      marks: extraction.extractors.map(extractor => ({
        building: extractor.building,
        // "Miner Mk.3" -> "Mk.3". The label only exists to tell one count from another; a
        // resource with a single extractor has nothing to tell apart, and the group above
        // already says what it is being built with.
        label: extraction.extractors.length > 1
          ? getBuildingDisplayName(extractor.building).replace(/^Miner /, '')
          : '',
        count: formatNumber(outputRemaining.value / (extractor.ratePerMin * PURITY_MULTIPLIERS[purity])),
      })),
    }))
  })

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
  // tooltip-info hardcodes `ml-2` on its root for use in flowing text. In these rows the flex
  // gap already spaces it, and the extra margin is what left it sitting off from the button.
  .group-status :deep(> span > span.text-caption) {
    margin-left: 0 !important;
  }

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
