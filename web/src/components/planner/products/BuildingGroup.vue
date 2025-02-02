<template>
  <div :key="group.id" class="d-flex align-center">
    <v-btn
      class="mr-2"
      color="red rounded"
      :disabled="product.buildingGroups.length === 1"
      icon="fas fa-trash"
      size="small"
      title="Delete Factory"
      variant="outlined"
      @click="deleteGroup(group)"
    />
    <v-chip
      class="sf-chip orange input"
      variant="tonal"
    >
      <game-asset :subject="building" type="building" />
      <v-number-input
        v-model.number="group.buildingCount"
        class="inline-inputs ml-0"
        control-variant="stacked"
        density="compact"
        hide-details
        hide-spin-buttons
        :min="0"
        type="number"
        width="100px"
        @update:model-value="updateGroup(group)"
      />
    </v-chip>
    @<v-chip
      class="sf-chip input unit yellow mx-1"
      variant="tonal"
    >
      <game-asset subject="overclock-production" type="item_id" />
      <v-number-input
        v-model.number="group.overclockPercent"
        class="inline-inputs ml-0"
        control-variant="stacked"
        density="compact"
        hide-details
        hide-spin-buttons
        :min="0"
        type="number"
        width="100px"
        @update:model-value="updateGroup(group)"
      />
      <span>%<tooltip-info classes="ml-n1" text="Not yet supported. Coming in a future release!" /></span>

    </v-chip>
    <div class="px-2">
      +
    </div>
    <v-chip
      class="sf-chip input sloop mx-1"
      variant="tonal"
    >
      <game-asset subject="somersloop" type="item_id" />
      <v-number-input
        v-model.number="group.somersloops"
        class="inline-inputs ml-0"
        control-variant="stacked"
        density="compact"
        disabled
        hide-details
        hide-spin-buttons
        :min="0"
        type="number"
        width="80px"
        @update:model-value="updateGroup(group)"
      />
      <span><tooltip-info classes="ml-n1" text="Not yet supported. Coming in a future release!" /></span>
    </v-chip>
    <div class="px-2">
      +
    </div>
    <template v-for="(_, part) in group.parts" :key="`${product.id}-${part}`">
      <v-chip
        v-if="part !== product.id"
        class="sf-chip blue input mx-1 text-body-1"
        variant="tonal"
      >
        <tooltip :text="getPartDisplayName(part)">
          <game-asset :subject="String(part)" type="item" />
        </tooltip>
        <v-number-input
          v-model.number="group.parts[part]"
          class="inline-inputs"
          control-variant="stacked"
          density="compact"
          hide-details
          hide-spin-buttons
          :min="0"
          :name="`${product.id}-${part}.amount`"
          width="110px"
        />
      </v-chip>
    </template>

    <div class="px-2">
      =
    </div>

    <template v-for="(_, part) in group.parts" :key="`${product.id}-${part}`">
      <v-chip
        v-if="part === product.id"
        class="sf-chip blue input mx-1 text-body-1"
        variant="tonal"
      >
        <tooltip :text="getPartDisplayName(part)">
          <game-asset :subject="String(part)" type="item" />
        </tooltip>
        <v-number-input
          v-model.number="group.parts[part]"
          class="inline-inputs"
          control-variant="stacked"
          density="compact"
          hide-details
          hide-spin-buttons
          :min="0"
          :name="`${product.id}-${part}.amount`"
          width="110px"
        />
      </v-chip>
      <v-chip
        v-if="partIsByProduct(String(part))"
        class="sf-chip green input mx-1 text-body-1"
        variant="tonal"
      >
        <tooltip :text="getPartDisplayName(part)">
          <game-asset :subject="String(part)" type="item" />
        </tooltip>
        <v-number-input
          v-model.number="group.parts[part]"
          class="inline-inputs"
          control-variant="stacked"
          density="compact"
          hide-details
          hide-spin-buttons
          :min="0"
          :name="`${product.id}-${part}.amount`"
          width="110px"
        />
      </v-chip>
    </template>
    <!--    <v-chip-->
    <!--      class="sf-chip input mx-1"-->
    <!--      variant="tonal"-->
    <!--    >[BYPRODUCT]</v-chip>-->
  </div>

</template>

<script setup lang="ts">
  import { defineProps, inject } from 'vue'
  import { Factory, FactoryItem, ProductBuildingGroup } from '@/interfaces/planner/FactoryInterface'
  import eventBus from '@/utils/eventBus'
  import { getPartDisplayName } from '@/utils/helpers'
  import { useGameDataStore } from '@/stores/game-data-store'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const gameData = useGameDataStore().getGameData()

  const props = defineProps<{
    factory: Factory
    group: ProductBuildingGroup
    product: FactoryItem
  }>()

  const building = props.product.buildingRequirements.name

  const updateGroup = (group: ProductBuildingGroup) => {
    console.log(group.buildingCount)
    if (group.buildingCount === 0 || isNaN(group.buildingCount) || group.buildingCount === null) {
      eventBus.emit('toast', {
        message: 'Building count must be a positive number.',
        type: 'warning',
      })
      group.buildingCount = 0.1
      return
    }

    updateFactory(props.factory)
  }

  const deleteGroup = (group: ProductBuildingGroup) => {
    const index = props.product.buildingGroups.indexOf(group)
    props.product.buildingGroups.splice(index, 1)
  }

  const hasByProduct = computed(() => {
    return props.product.byProducts && props.product.byProducts.length > 0 && props.product.byProducts[0].id
  })

  const partIsByProduct = (part: string) => {
    if (!hasByProduct.value) return false

    if (!props.product.byProducts?.length) {
      throw new Error('Somehow checking for byproduct that does not exist!')
    }

    return part === props.product.byProducts[0].id
  }

</script>
