<template>
  <div
    :id="`${factory.id}-${group.id}-building-group`"
    :key="`${factory.id}-${group.id}`"
    class="d-flex flex-wrap items-center align-center"
  >
    <div>
      <v-btn
        :id="`${factory.id}-${group.id}-delete-building-group`"
        color="red rounded mr-1"
        :disabled="item.buildingGroups.length === 1"
        icon="fas fa-trash"
        size="small"
        title="Delete Building Group"
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
          :id="`${factory.id}-${group.id}-building-count`"
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
          :id="`${factory.id}-${group.id}-clock`"
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
          @update:model-value="updateGroupOverclockDebounce(group)"
        />
        <span>%</span>
        <span v-if="updatingOverclock">
          <v-icon>fas fa-sync fa-spin</v-icon>
        </span>
      </v-chip>
      <div class="underchip text-yellow-darken-2">
        <span
          v-if="group.type !== GroupType.Power"
          :id="`${factory.id}-${group.id}-group-power`"
        >
          Group Power: {{ formatPower(group.powerUsage).value }} {{ formatPower(group.powerUsage).unit }}
        </span>
        <span v-else>&nbsp;</span>
      </div>
    </div>
    <div class="px-1">
      <div>+</div>
      <div class="underchip">&nbsp;</div>
    </div>
    <template v-if="group.type === GroupType.Product">
      <div>
        <v-chip
          class="sf-chip input sloop mx-1"
          variant="tonal"
        >
          <tooltip text="Somersloop">
            <game-asset subject="somersloop" type="item_id" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${group.id}-somersloops`"
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
    </template>
    <template v-if="group.type === GroupType.Product">
      <div :class="{'w-100': partCount > 4 && lgAndDown}" />
      <div :class="lgAndDown && partCount > 4 ? 'px-4' : 'px-1'">
        <div>+</div>
        <div class="underchip">&nbsp;</div>
      </div>
    </template>
    <!-- Spacer if there's too many items on small screens -->
    <template v-for="(_, part) in group.parts" :key="`${item.id}-${part}`">
      <div v-if="part.toString() !== item.id && !partIsByProduct(String(part), group.type)">
        <v-chip
          v-if="part.toString() !== item.id"
          class="sf-chip blue input mx-1 text-body-1"
          :class="chipColors(String(part))"
          variant="tonal"
        >
          <tooltip :text="getPartDisplayName(part)">
            <game-asset :subject="String(part)" type="item" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${group.id}-parts-${part}-amount`"
            v-model.number="group.parts[part]"
            class="inline-inputs"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :min="0"
            width="110px"
            @update:model-value="updateGroupPartsDebounce(part.toString())"
          />
          <span v-if="updatingPart === part.toString()">
            <v-icon>fas fa-sync fa-spin</v-icon>
          </span>
        </v-chip>
        <div
          :id="`${factory.id}-${group.id}-underchip-${part}`"
          class="underchip"
          :class="underchipColors(String(part))"
        >
          {{ formatNumberFully(group.parts[part] / group.buildingCount) ?? 0 }} / building
        </div>
      </div>
    </template>
    <!-- Spacer if there's too many items on big screens -->
    <div :class="{'w-100': partCount > 4 && lgAndUp}" />
    <div :class="partCount > 4 && lgAndUp ? 'px-4' : 'px-1'">
      <div>=</div>
      <div class="underchip">&nbsp;</div>
    </div>
    <!-- Rendering for products / byproducts -->
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
            :id="`${factory.id}-${group.id}-parts-${part}-amount`"
            v-model.number="group.parts[part]"
            class="inline-inputs"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :min="0"
            width="110px"
            @update:model-value="updateGroupPartsDebounce(part.toString())"
          />
          <span v-if="updatingPart === part.toString()">
            <v-icon>fas fa-sync fa-spin</v-icon>
          </span>
        </v-chip>

        <div
          :id="`${factory.id}-${group.id}-underchip-${part}`"
          class="underchip"
          :class="underchipColors(String(part))"
        >
          {{ formatNumberFully(group.parts[part] / group.buildingCount) }} / building
        </div>
      </div>
    </template>

    <!-- Power production -->
    <template v-if="group.type === GroupType.Power">
      <div>
        <v-chip
          class="sf-chip yellow ml-1"
          variant="tonal"
        >
          <i class="fas fa-bolt" />
          <i class="fas fa-plus" />
          <span :id="`${factory.id}-${group.id}-power`" class="ml-2">
            {{ formatPower(group.powerProduced ?? 0).value }} {{ formatPower(group.powerProduced ?? 0).unit }}
          </span>
        </v-chip>
        <div class="underchip">&nbsp;</div>
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
  import { getPartDisplayName } from '@/utils/helpers'
  import { useDisplay } from 'vuetify'
  import { formatNumberFully, formatPower } from '@/utils/numberFormatter'
  import { deleteBuildingGroup, updateBuildingGroupViaPart } from '@/utils/factory-management/building-groups/common'
  import { updateBuildingGroup } from '@/components/planner/products/BuildingGroup'
  import eventBus from '@/utils/eventBus'
  import { CalculationModes } from '@/utils/factory-management/factory'

  const updateFactory = inject('updateFactory') as (factory: Factory, modes?: CalculationModes) => void

  // const timeout: NodeJS.Timeout | null = null
  const updatingPart = ref('')
  const updatingOverclock = ref(false)

  const timeout = ref<NodeJS.Timeout | null>(null)

  const { lgAndDown, lgAndUp } = useDisplay()

  const props = defineProps<{
    factory: Factory
    group: BuildingGroup
    item: FactoryItem | FactoryPowerProducer
    building: string // Building name
  }>()

  const updateGroup = (group: BuildingGroup) => {
    updateBuildingGroup(group)

    // Update the factory
    updateFactory(props.factory, { useBuildingGroupBuildings: true })
  }

  const updateGroupOverclockDebounce = (group: BuildingGroup) => {
    updatingOverclock.value = true
    if (timeout.value) {
      clearTimeout(timeout.value)
    }

    timeout.value = setTimeout(() => {
      console.log('Updating building group overclock')
      updateBuildingGroup(group)
      updateFactory(props.factory, { useBuildingGroupBuildings: true, allowOverclockImbalance: true })
      updatingOverclock.value = false
      console.log('Overclock updated')
      eventBus.emit('buildingGroupUpdated', props.factory)
    }, 750)
  }

  const deleteGroup = (group: BuildingGroup) => {
    deleteBuildingGroup(props.item, group)
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
      throw new Error('BuildingGroup: isByProduct: Invalid type!')
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

  const underchipColors = (part: string) => {
    return {
      'text-blue-darken-1': !partIsByProduct(part, props.group.type),
      'text-cyan': props.factory.parts[part].isRaw && !partIsByProduct(part, props.group.type),
      'text-grey-lighten-2': partIsByProduct(part, props.group.type),
    }
  }

  const partCount = computed(() => {
    return Object.values(props.group.parts).length
  })

  const updateGroupPartsDebounce = (
    part: string
  ) => {
    updatingPart.value = part
    if (timeout.value) {
      clearTimeout(timeout.value)
    }

    timeout.value = setTimeout(() => {
      console.log('Updating building group parts')
      updateBuildingGroupViaPart(
        props.group,
        props.item,
        props.group.type,
        props.factory,
        part,
        props.group.parts[part],
      )
      updatingPart.value = ''
      console.log(`Part ${part} updated`)
      eventBus.emit('buildingGroupUpdated', props.factory)
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
