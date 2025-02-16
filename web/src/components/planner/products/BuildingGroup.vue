<template>
  <div :key="group.id" class="d-flex flex-wrap items-center align-center">
    <div>
      <v-btn
        color="red rounded mr-1"
        :disabled="item.buildingGroups.length === 1"
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
        Group Power: {{ formatPower(group.powerUsage).value }} {{ formatPower(group.powerUsage).unit }}
      </div>
    </div>
    <div class="px-1">
      <div>+</div>
      <div class="underchip">&nbsp;</div>
    </div>
    <div>
      <v-chip
        v-if="group.type === GroupType.Product"
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
    <template v-for="(_, part) in group.parts" :key="`${item.id}-${part}`">
      <div v-if="part.toString() !== item.id">
        <v-chip
          v-if="part.toString() !== item.id"
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
            :name="`${item.id}-${part}.amount`"
            width="110px"
            @update:model-value="updateGroupPartsDebounce(group, item, part.toString())"
          />
          <span v-if="updatingPart === part.toString()">
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
    <template v-for="(_, part) in group.parts" :key="`${item.id}-${part}`">
      <div v-if="part.toString() === item.id || partIsByProduct(String(part), group.type)">
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
            :name="`${item.id}-${part}.amount`"
            width="110px"
          />
        </v-chip>
        <div class="underchip" :class="partIsByProduct(String(part), group.type) ? 'text-grey-lighten-2' : 'text-blue-darken-1'">
          {{ formatNumberFully(group.parts[part] / group.buildingCount) }} / building
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { defineProps, inject } from 'vue'
  import {
    BuildingGroup,
    Factory,
    FactoryItem,
    FactoryPowerProducer,
    GroupType,
  } from '@/interfaces/planner/FactoryInterface'
  import eventBus from '@/utils/eventBus'
  import { getPartDisplayName } from '@/utils/helpers'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { increaseProductQtyViaBuilding } from '@/utils/factory-management/products'
  import { useDisplay } from 'vuetify'
  // import { updateGroupParts } from '@/utils/factory-management/productBuildingGroups'
  import { formatNumberFully, formatPower } from '@/utils/numberFormatter'
  import { PowerItem } from '@/interfaces/Recipes'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const gameData = useGameDataStore().getGameData()

  // const timeout: NodeJS.Timeout | null = null
  let updatingPart: string

  const { lgAndDown, lgAndUp } = useDisplay()

  const props = defineProps<{
    factory: Factory
    group: BuildingGroup
    item: FactoryItem | FactoryPowerProducer
    building: string // Building name
  }>()

  const updateGroup = (group: BuildingGroup) => {
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

    if (props.item.buildingGroups.length === 1) {
      // Since we have edited the buildings in the group, we now need to edit the product's building requirements.
      if (props.group.type === GroupType.Product) {
        const subject = props.item as FactoryItem
        subject.buildingRequirements.amount = group.buildingCount
        increaseProductQtyViaBuilding(subject, gameData)
      } else if (props.group.type === GroupType.Power) {
        const subject = props.item as FactoryPowerProducer
        subject.buildingCount = 1
      } else {
        throw new Error('Invalid type')
      }
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

  const deleteGroup = (group: BuildingGroup) => {
    let index = 0
    index = props.item.buildingGroups.indexOf(group)

    props.item.buildingGroups.splice(index, 1)
  }

  const hasByProduct = computed(() => {
    return isByProduct(props.group.type)
  })

  const isByProduct = (groupType: GroupType) => {
    let subject: FactoryItem | FactoryPowerProducer
    if (groupType === GroupType.Product) {
      subject = props.item as FactoryItem
      return subject.byProducts && subject.byProducts.length > 0 && subject.byProducts[0].id
    } else if (groupType === GroupType.Power) {
      subject = props.item as FactoryPowerProducer
      return subject.byproduct
    } else {
      throw new Error('BuildingGroup: hasByProduct: Invalid type!')
    }
  }

  const partIsByProduct = (part: string, groupType: GroupType) => {
    if (!hasByProduct.value) return false
    let subject = props.item as FactoryItem | FactoryPowerProducer

    if (groupType === GroupType.Product) {
      subject = props.item as FactoryItem
      if (!subject.byProducts?.length) {
        throw new Error('BuildingGroup: Somehow checking for byproduct on a FactoryItem that does not exist!')
      }
      return part === subject.byProducts[0].id
    } else if (groupType === GroupType.Power) {
      subject = props.item as FactoryPowerProducer
      return part === subject.byproduct?.part
    } else {
      throw new Error('BuildingGroup: partIsByProduct: Invalid type!')
    }
  }

  const chipColors = (part: string) => {
    const isRaw = props.factory.parts[part].isRaw

    return {
      cyan: isRaw && !partIsByProduct(part, props.group.type),
      blue: !isRaw && !partIsByProduct(part, props.group.type),
      nocolor: partIsByProduct(part, props.group.type),
    }
  }

  const partCount = computed(() => {
    return Object.values(props.group.parts).length
  })

  const updateGroupPartsDebounce = (group: BuildingGroup, item: FactoryItem | PowerItem, part: string) => {
    // updatingPart = part
    // if (timeout) {
    //   clearTimeout(timeout)
    // }
    //
    // timeout = setTimeout(() => {
    //   updateGroupParts(group, product, part)
    //   updatingPart = ''
    // }, 750)
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
