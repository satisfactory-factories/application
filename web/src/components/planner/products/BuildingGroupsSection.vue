<template>
  <div class="mb-2">
    <!-- Default size rather than small: the bar carries the shard and somersloop chips, which
         need the height to seat properly, and it reads as the divider it is. -->
    <v-btn
      :id="`${idPrefix}-building-groups-toggle`"
      block
      :color="item.buildingGroupsHaveProblem ? 'red' : 'green'"
      :disabled="disabled || forceOpen"
      size="default"
      variant="tonal"
      @click="toggleTray"
    >
      <span v-if="!forceOpen" class="mr-2">
        <span v-if="trayOpen"><i class="fas fa-chevron-up" /></span>
        <span v-else><i class="fas fa-chevron-down" /></span>
      </span>
      <i class="fas fa-layer-group" />
      <span v-if="item.buildingGroupsHaveProblem" class="ml-2">
        <i class="fas fa-exclamation-triangle" /> Building Groups have a problem!
      </span>
      <span v-else class="ml-2">
        {{ forceOpen ? '' : (trayOpen ? 'Close ' : 'Open ') }}Building Groups ({{ item.buildingGroups.length }})
        <tooltip-info :is-caption="false" :text="introTooltip" />
      </span>
      <v-chip class="sf-chip yellow x-small ml-3" variant="tonal">
        <tooltip :text="`Total Power Shards needed by this ${itemNoun}'s Building Groups (1 per building per 50% clock above 100%)`">
          <game-asset height="18px" subject="power-shard" type="item_id" width="18px" />
        </tooltip>
        <span :id="`${idPrefix}-power-shards-total`" class="ml-1">{{ getTotalPowerShards(item.buildingGroups) }}</span>
      </v-chip>
      <v-chip
        v-if="type === ItemType.Product || somersloopBuildCost > 0"
        class="sf-chip sloop x-small ml-2"
        variant="tonal"
      >
        <tooltip :text="somersloopTooltip">
          <game-asset height="18px" subject="somersloop" type="item_id" width="18px" />
        </tooltip>
        <span :id="`${idPrefix}-somersloops-total`" class="ml-1">{{ getTotalSomersloops(item.buildingGroups, building) }}</span>
      </v-chip>
    </v-btn>
    <div v-if="trayOpen" class="mt-2 buildingGroups" :class="item.buildingGroupsHaveProblem ? 'problem' : ''">
      <building-groups
        :building="building"
        :factory="factory"
        :item="item"
        :type="type"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Factory, FactoryItem, FactoryPowerProducer, ItemType } from '@/interfaces/planner/FactoryInterface'
  import { getTotalPowerShards, toggleBuildingGroupTray } from '@/utils/factory-management/building-groups/common'
  import { getSomersloopBuildCost, getTotalSomersloops } from '@/utils/factory-management/building-groups/somersloops'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    factory: Factory
    item: FactoryItem | FactoryPowerProducer
    building: string
    type: ItemType
    idPrefix: string
    disabled?: boolean
    // Alien Power Augmenters keep their groups on show: the groups carry the matrix toggle
    // and own the building count, so a collapsed tray hides the only controls that work.
    forceOpen?: boolean
  }>()

  // The open/shut flag is stored on the product and travels with the plan, so the toggle is
  // an edit like any other rather than local view state.
  const toggleTray = () => {
    toggleBuildingGroupTray(props.item)
    markFactoryEdited(props.factory)
  }

  const trayOpen = computed(() => props.forceOpen || props.item.buildingGroupsTrayOpen)

  const itemNoun = computed(() => props.type === ItemType.Product ? 'product' : 'producer')

  const somersloopBuildCost = computed(() => getSomersloopBuildCost(props.building))

  const somersloopTooltip = computed(() => somersloopBuildCost.value > 0
    ? `Total Somersloops consumed constructing this ${itemNoun.value}'s buildings (${somersloopBuildCost.value} each)`
    : "Total Somersloops used by this product's Building Groups",
  )

  const introTooltip = computed(() => {
    if (props.forceOpen) {
      return 'Building Groups are where an Alien Power Augmenter is configured: each group holds a set of augmenters and decides whether they are supplied with Alien Power Matrixes.<br>They stay open because there is nothing to set on the producer line itself.'
    }

    return props.type === ItemType.Product
      ? "Building Groups turn this product's abstract building count into the real machines you'd build in-game: sets of identical buildings, each group with its own building count, overclock % and Somersloops.<br>Use them to plan your exact layout and see true per-group part rates and power usage."
      : "Building Groups turn this producer's abstract building count into the real generators you'd build in-game: sets of identical buildings, each group with its own building count and overclock %.<br>Use them to plan your exact layout and see true per-group fuel rates and power output."
  })
</script>
