<template>
  <div :key="group.id" class="d-flex flex-wrap items-center align-center">
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
      <tooltip text="Overclock">
        <game-asset subject="overclock-production" type="item_id" />
      </tooltip>
      <v-number-input
        v-model.number="group.overclockPercent"
        class="inline-inputs ml-0"
        control-variant="stacked"
        density="compact"
        hide-details
        hide-spin-buttons
        :max="250"
        :min="0"
        type="number"
        width="100px"
        @update:model-value="updateGroup(group)"
      />
      <span>%</span>
    </v-chip>
    <div class="px-2">
      +
    </div>
    <v-chip
      class="sf-chip input sloop mx-1"
      variant="tonal"
    >
      <tooltip text="Somersloop">
        <game-asset subject="somersloop" type="item_id" />
      </tooltip>
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
    <!-- Spacer if there's too many items -->
    <div :class="{'w-100': partCount > 4 && lgAndDown}" />
    <div :class="lgAndDown ? 'px-4' : 'px-2'">
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
        v-if="part === product.id || partIsByProduct(String(part))"
        class="sf-chip input mx-1 text-body-1"
        :class="chipColors(String(part))"
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
  </div>

</template>

<script setup lang="ts">
  import { defineProps, inject } from 'vue'
  import { Factory, FactoryItem, ProductBuildingGroup } from '@/interfaces/planner/FactoryInterface'
  import eventBus from '@/utils/eventBus'
  import { getPartDisplayName } from '@/utils/helpers'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
  import { useDisplay } from 'vuetify'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const gameData = useGameDataStore().getGameData()

  const { lgAndDown } = useDisplay()

  const props = defineProps<{
    factory: Factory
    group: ProductBuildingGroup
    product: FactoryItem
  }>()

  const building = props.product.buildingRequirements.name

  const updateGroup = (group: ProductBuildingGroup) => {
    if (group.buildingCount === 0 || isNaN(group.buildingCount) || group.buildingCount === null) {
      eventBus.emit('toast', {
        message: 'Building count must be a positive number.',
        type: 'warning',
      })
      group.buildingCount = 1
      return
    }

    // Ensure the building count is a whole number
    if (group.buildingCount % 1 !== 0) {
      eventBus.emit('toast', {
        message: 'Building count must equal to a whole number. If you need a single building clocked, create a new building group and adjust it\'s clock.',
        type: 'error',
        timeout: 5000,
      })
      group.buildingCount = Math.floor(group.buildingCount)
    }

    if (props.product.buildingGroups.length === 1) {
      // Since we have edited the buildings in the group, we now need to edit the product's building requirements.
      // Reduce all the groups building counts to get the total building count.
      // Update the product's building requirements
      props.product.buildingRequirements.amount = group.buildingCount
      increaseProductQtyViaBuilding(props.product, gameData)
    } else {
      eventBus.emit('toast', {
        message: 'Since you have multiple building groups, please ensure the total building count is correct.',
        type: 'info',
      })
    }

    // Update the factory
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

  const chipColors = (part: string) => {
    const isRaw = props.factory.parts[part].isRaw

    return {
      cyan: isRaw && !partIsByProduct(part),
      blue: !isRaw && !partIsByProduct(part),
      nocolor: partIsByProduct(part),
    }
  }

  const partCount = computed(() => {
    return Object.values(props.group.parts).length
  })

</script>
