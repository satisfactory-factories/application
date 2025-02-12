<template>
  <div :key="group.id" class="d-flex flex-wrap items-center align-center">
    <div>
      <v-btn
        color="red rounded mr-1"
        :disabled="product.buildingGroups.length === 1"
        icon="fas fa-trash"
        size="small"
        title="Delete Factory"
        variant="outlined"
        @click="deleteGroup(group)"
      />
      <div class="underchip">&nbsp;</div>
    </div>
    <div>
      <v-chip
        class="sf-chip orange input mx-1"
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
      <div class="underchip">&nbsp;</div>
    </div>
    <div class="px-1">
      <div>@</div>
      <div class="underchip">&nbsp;</div>
    </div>
    <div>
      <v-chip
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
          width="125px"
          @update:model-value="updateGroup(group)"
        />
        <span>%</span>
      </v-chip>
      <div class="underchip text-yellow-darken-2">
        Power used: {{ formatPower(group.powerUsage).value }} {{ formatPower(group.powerUsage).unit }}
      </div>
    </div>
    <div class="px-1">
      <div>+</div>
      <div class="underchip">&nbsp;</div>
    </div>
    <div>
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
      </v-chip>
      <div class="underchip text-purple-lighten-1">
        Coming soon!
      </div>
    </div>
    <!-- Spacer if there's too many items on small screens -->
    <div :class="{'w-100': partCount > 4 && lgAndDown}" />
    <div :class="lgAndDown && partCount > 4 ? 'px-4' : 'px-1'">
      <div>+</div>
      <div class="underchip">&nbsp;</div>
    </div>
    <template v-for="(_, part) in group.parts" :key="`${product.id}-${part}`">
      <div v-if="part !== product.id">
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
            @update:model-value="updateGroupPartsDebounce(group, product, part.toString())"
          />
          <span v-if="updatingPart === part">
            <v-icon>fas fa-sync fa-spin</v-icon>
          </span>
        </v-chip>
        <div class="underchip text-blue-darken-1">
          {{ formatNumberFully(group.parts[part] / group.buildingCount) }} / building
        </div>
      </div>
    </template>
    <!-- Spacer if there's too many items on big screens -->
    <div :class="{'w-100': partCount > 4 && lgAndUp}" />
    <div :class="partCount > 4 && lgAndUp ? 'px-4' : 'px-1'">
      <div>=</div>
      <div class="underchip">&nbsp;</div>
    </div>
    <template v-for="(_, part) in group.parts" :key="`${product.id}-${part}`">
      <div v-if="part === product.id || partIsByProduct(String(part))">
        <v-chip
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
        <div class="underchip" :class="partIsByProduct(String(part)) ? 'text-grey-lighten-2' : 'text-blue-darken-1'">
          {{ formatNumberFully(group.parts[part] / group.buildingCount) }} / building
        </div>
      </div>
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
  import { updateGroupParts } from '@/utils/factory-management/productBuildingGroups'
  import { formatNumberFully, formatPower } from '@/utils/numberFormatter'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const gameData = useGameDataStore().getGameData()

  let timeout: NodeJS.Timeout | null = null
  let updatingPart: string

  const { lgAndDown, lgAndUp } = useDisplay()

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
      props.product.buildingRequirements.amount = group.buildingCount
      increaseProductQtyViaBuilding(props.product, gameData)
    }

    // If the user is trying to use more than .0001 precision for overclock, truncate it and alert them.
    const clock = group.overclockPercent.toString().split('.')[0]
    const precision = group.overclockPercent.toString().split('.')[1]
    if (precision?.length > 4) {
      // Truncate the overclock to 4 decimal places.2255255255525555
      group.overclockPercent = Number(`${clock}.${precision.slice(0, 4)}`)
      eventBus.emit('toast', {
        message: 'The game does not allow you to provide more than 4 decimal places for clocks.',
        type: 'warning',
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

  const updateGroupPartsDebounce = (group: ProductBuildingGroup, product: FactoryItem, part: string) => {
    updatingPart = part
    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      updateGroupParts(group, product, part)
      updatingPart = ''
    }, 750)
  }
</script>

<style lang="scss" scoped>
.underchip {
  margin-top: -5px;
  text-align: center;
  align-items: center;
  font-size: 0.8rem;
}
</style>
