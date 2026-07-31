<template>
  <div
    :id="`${factory.id}-${group.id}-building-group`"
    :key="`${factory.id}-${group.id}`"
    class="d-flex flex-wrap items-center align-center building-group-row"
  >
    <div>
      <v-btn
        :id="`${factory.id}-${group.id}-delete`"
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
        <tooltip :text="getBuildingDisplayName(groupBuilding)">
          <game-asset clickable :subject="groupBuilding" type="building" />
        </tooltip>
        <v-number-input
          :id="`${factory.id}-${group.id}-building-count`"
          v-model="group.buildingCount"
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
        <!-- Extraction only: the mark sits on the group because one ore line routinely
             mixes a Mk.3 on a pure node with a Mk.2 on a normal one. -->
        <v-select
          v-if="isExtraction && extractorOptions.length > 1"
          :id="`${factory.id}-${group.id}-extractor`"
          class="inline-inputs ml-1 chip-select"
          density="compact"
          hide-details
          :items="extractorOptions"
          :model-value="groupBuilding"
          variant="plain"
          width="125px"
          @update:model-value="updateGroupExtractor(group, $event)"
        />
        <debounce-spinner :active="pendingRecalc === `group-${group.id}-buildings`" />
      </v-chip>
      <div class="underchip">&nbsp;</div>
    </div>
    <!-- Buildings without shard slots (Geothermal, Alien Power Augmenter) get no clock UI at all -->
    <template v-if="canBuildingOverclock(groupBuilding)">
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
            <game-asset clickable subject="overclock-production" type="item_id" wiki-name="Clock speed" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${group.id}-clock`"
            v-model="group.overclockPercent"
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
        <div class="underchip text-power-consumption">
          <span
            v-if="group.type !== ItemType.Power"
            class="d-inline-flex align-center"
          >
            <i class="fas fa-bolt" />
            <i class="fas fa-minus" />
            <span :id="`${factory.id}-${group.id}-group-power`" class="ml-1">{{ formatMw(group.powerUsage) }}</span>
            <span v-if="groupHasVariablePower" :id="`${factory.id}-${group.id}-group-power-range`" class="ml-1">
              ({{ formatMw(group.powerUsageMin ?? 0) }} – {{ formatMw(group.powerUsageMax ?? 0) }})
            </span>
          </span>
          <span v-else>&nbsp;</span>
        </div>
      </div>
    </template>
    <div class="px-1">
      <div>+</div>
      <div class="underchip">&nbsp;</div>
    </div>
    <!-- Alien Power Augmenter: matrix supply toggle and construction somersloop cost, both inputs to the group -->
    <template v-if="group.type === ItemType.Power && building === 'alienpoweraugmenter'">
      <div>
        <v-chip
          class="sf-chip input mx-1"
          variant="tonal"
        >
          <tooltip text="Supply this group's augmenters with Alien Power Matrixes (5/min each), raising their circuit boost from 10% to 30% of the grid's generation.">
            <game-asset subject="AlienPowerFuel" type="item" />
          </tooltip>
          <v-switch
            :id="`${factory.id}-${group.id}-supply-matrixes`"
            v-model="group.supplyMatrixes"
            class="mx-2"
            :color="sfColors.circuitBoost.color"
            density="compact"
            hide-details
            label="Inject Matrices"
            @update:model-value="updateGroup(group, 'matrixes')"
          />
        </v-chip>
        <div class="underchip text-boost">
          <span :id="`${factory.id}-${group.id}-boost-percent`">+{{ group.supplyMatrixes ? '30' : '10' }}% circuit boost / building</span>
        </div>
      </div>
      <div>
        <v-chip
          class="sf-chip input sloop mx-1"
          variant="tonal"
        >
          <tooltip :text="`Constructing each Alien Power Augmenter consumes ${somersloopBuildCost} Somersloops`">
            <game-asset clickable subject="somersloop" type="item_id" wiki-name="Somersloop" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${group.id}-sloop-cost`"
            class="inline-inputs ml-0"
            control-variant="stacked"
            density="compact"
            disabled
            hide-details
            hide-spin-buttons
            :model-value="somersloopBuildCost * group.buildingCount"
            type="number"
            width="80px"
          />
        </v-chip>
        <div class="underchip text-purple-lighten-1">{{ somersloopBuildCost }} / building</div>
      </div>
    </template>
    <!-- Extraction groups get node purity where a normal product gets somersloops: miners have
         no amplification slots, and purity is the equivalent per-group output multiplier. -->
    <template v-if="isExtraction">
      <div v-if="purityOptions.length > 1">
        <v-chip
          class="sf-chip input cyan mx-1"
          variant="tonal"
        >
          <tooltip text="Node purity">
            <v-icon icon="fas fa-gem" size="20" />
          </tooltip>
          <v-select
            :id="`${factory.id}-${group.id}-purity`"
            class="inline-inputs ml-1 chip-select"
            density="compact"
            hide-details
            :items="purityOptions"
            :model-value="groupPurity"
            variant="plain"
            width="90px"
            @update:model-value="updateGroupPurity(group, $event)"
          />
        </v-chip>
        <div class="underchip text-cyan">x{{ purityMultiplier }} node yield</div>
      </div>
    </template>
    <template v-else-if="group.type === ItemType.Product">
      <div>
        <v-chip
          class="sf-chip input sloop mx-1"
          variant="tonal"
        >
          <tooltip text="Somersloop">
            <game-asset clickable subject="somersloop" type="item_id" wiki-name="Somersloop" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${group.id}-somersloops`"
            :key="somersloopFieldKey"
            class="inline-inputs ml-0"
            control-variant="stacked"
            density="compact"
            :disabled="somersloopSlots === 0"
            hide-details
            hide-spin-buttons
            :min="0"
            :model-value="group.somersloops"
            type="number"
            width="80px"
            @update:model-value="updateGroupSomersloops"
          >
            <!-- Own increment button so it greys out at the slot cap. Vuetify's own does
                 that via `max`, but `max` also stops the field emitting out-of-range
                 entries, which is what the typed-value clamp needs to see. -->
            <template #increment="{ props: incrementProps }">
              <v-btn
                v-bind="incrementProps"
                aria-hidden="true"
                :disabled="(group.somersloops ?? 0) >= somersloopSlots"
                tabindex="-1"
              />
            </template>
          </v-number-input>
          <debounce-spinner :active="pendingRecalc === `group-${group.id}-somersloops`" />
        </v-chip>
        <div class="underchip text-purple-lighten-1">
          <span v-if="somersloopSlots === 0">Cannot be amplified</span>
          <span v-else-if="(group.somersloops ?? 0) > 0">+{{ somersloopBoostPercent }}% output / building</span>
          <span v-else>{{ somersloopSlots }} slot{{ somersloopSlots > 1 ? 's' : '' }} / building</span>
        </div>
      </div>
    </template>
    <template v-if="group.type === ItemType.Product">
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
            <game-asset clickable :subject="String(part)" type="item" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${group.id}-parts-${part}-amount`"
            v-model="group.parts[part]"
            class="inline-inputs ml-0"
            control-variant="stacked"
            density="compact"
            :disabled="building === 'alienpoweraugmenter'"
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
            <game-asset clickable :subject="String(part)" type="item" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${group.id}-parts-${part}-amount`"
            v-model="group.parts[part]"
            class="inline-inputs ml-0"
            control-variant="stacked"
            density="compact"
            :disabled="building === 'alienpoweraugmenter'"
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
    <template v-if="group.type === ItemType.Power">
      <div>
        <v-chip
          class="sf-chip green ml-1"
          variant="tonal"
        >
          <i class="fas fa-bolt" />
          <i class="fas fa-plus" />
          <span :id="`${factory.id}-${group.id}-power`" class="ml-2">
            {{ formatMw(group.powerProduced ?? 0) }}
          </span>
          <span v-if="groupHasVariableProduction" :id="`${factory.id}-${group.id}-power-range`" class="ml-1">
            ({{ formatMw(group.powerProducedMin ?? 0) }} – {{ formatMw(group.powerProducedMax ?? 0) }})
          </span>
        </v-chip>
        <div class="underchip">&nbsp;</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { inject } from 'vue'
  import {
    BuildingGroup,
    Factory,
    FactoryItem,
    FactoryPowerProducer,
    ItemType,
  } from '@/interfaces/planner/FactoryInterface'
  import { getPartDisplayName } from '@/utils/helpers'
  import { sfColors } from '@/utils/colors'
  import { useDisplay } from 'vuetify'
  import { formatMw, formatNumberFully } from '@/utils/numberFormatter'
  import { canBuildingOverclock, getBuildingDisplayName } from '@/utils/factory-management/common'
  import { deleteBuildingGroup, updateBuildingGroupViaPart } from '@/utils/factory-management/building-groups/common'
  import {
    getSomersloopBuildCost,
    getSomersloopOutputMultiplier,
    getSomersloopSlots,
  } from '@/utils/factory-management/building-groups/somersloops'
  import {
    getExtraction,
    getGroupExtractor,
    getGroupPurity,
    PURITY_LABELS,
    PURITY_MULTIPLIERS,
  } from '@/utils/factory-management/building-groups/extraction'
  import { NodePurity } from '@/interfaces/Recipes'
  import { applyGroupSomersloops, updateBuildingGroup } from '@/components/planner/products/BuildingGroup'
  import eventBus from '@/utils/eventBus'
  import { CalculationModes } from '@/utils/factory-management/factory'
  import { afterRender, useDebouncedAction } from '@/composables/useDebouncedAction'

  const updateFactory = inject('updateFactory') as (factory: Factory, modes?: CalculationModes) => void
  const { debouncing: pendingRecalc, runDebounced } = useDebouncedAction()

  // const timeout: NodeJS.Timeout | null = null
  const updatingPart = ref('')
  const updatingOverclock = ref(false)
  // Guards the post-paint spinner clear against a newer edit re-arming the flag.
  let updateRunId = 0

  const timeout = ref<NodeJS.Timeout | null>(null)

  const { lgAndDown, lgAndUp } = useDisplay()

  const props = defineProps<{
    factory: Factory
    group: BuildingGroup
    item: FactoryItem | FactoryPowerProducer
    building: string // Building name
  }>()

  // Each input gets its own debounce key so only the field being edited spins.
  const updateGroup = (group: BuildingGroup, field = 'buildings') => {
    // The typed value echoes instantly via v-model; ALL derived work — including the
    // group's own power/parts recompute — waits for the debounce, otherwise dependent
    // displays update per keystroke and drag renders with them.
    runDebounced(`group-${group.id}-${field}`, () => {
      updateBuildingGroup(group)
      updateFactory(props.factory, {
        useBuildingGroupBuildings: true,
        forceRebalance: false,
        origin: 'buildingGroup',
      })
    })
  }

  const somersloopSlots = computed(() => getSomersloopSlots(props.building))
  // Bumped to remount the somersloop field when a typed value has to be clamped.
  const somersloopFieldKey = ref(0)

  // ==== Extraction
  const extraction = computed(() => getExtraction(props.item.recipe))
  const isExtraction = computed(() => !!extraction.value)

  // The building shown and priced for this group: its own extractor when extracting, since a
  // single product can span several marks, otherwise the item's one building.
  const groupBuilding = computed(() =>
    isExtraction.value ? getGroupExtractor(props.group, props.item.recipe) : props.building
  )

  const groupPurity = computed(() => getGroupPurity(props.group, props.item.recipe))
  const purityMultiplier = computed(() => PURITY_MULTIPLIERS[groupPurity.value])
  const extractorOptions = computed(() =>
    (extraction.value?.extractors ?? []).map(extractor => ({
      title: getBuildingDisplayName(extractor.building),
      value: extractor.building,
    }))
  )

  const purityOptions = computed(() =>
    (extraction.value?.purities ?? []).map(purity => ({
      title: PURITY_LABELS[purity],
      value: purity,
    }))
  )

  const updateGroupExtractor = (group: BuildingGroup, building: string) => {
    group.extractorBuilding = building
    updateGroup(group)
  }

  const updateGroupPurity = (group: BuildingGroup, purity: NodePurity) => {
    group.purity = purity
    updateGroup(group)
  }

  const groupHasVariablePower = computed(() => {
    return props.group.powerUsageMax !== undefined && props.group.powerUsageMax !== props.group.powerUsage
  })

  const groupHasVariableProduction = computed(() => {
    return props.group.powerProducedMax !== undefined && props.group.powerProducedMax !== props.group.powerProduced
  })

  const somersloopBuildCost = computed(() => getSomersloopBuildCost(props.building))

  const somersloopBoostPercent = computed(() => {
    return formatNumberFully((getSomersloopOutputMultiplier(props.group, props.building) - 1) * 100)
  })

  const updateGroupSomersloops = (value: number | null) => {
    const group = props.group
    // Clamp on entry, not on the debounce: an out-of-range value left on screen reads as
    // though the planner accepted it, even though the calculation only ever uses the cap.
    if (applyGroupSomersloops(group, props.building, value)) {
      // Vuetify keeps the typed text regardless of the model, so remount the field to
      // show the clamped value, then hand focus back where the user left it.
      somersloopFieldKey.value++
      nextTick(() => document.getElementById(`${props.factory.id}-${group.id}-somersloops`)?.focus())
    }

    runDebounced(`group-${group.id}-somersloops`, () => {
      updateBuildingGroup(group)
      updateFactory(props.factory, {
        useBuildingGroupBuildings: true,
        forceRebalance: false,
        origin: 'buildingGroup',
      })
    })
  }

  const updateGroupOverclockDebounce = (group: BuildingGroup) => {
    // The user dialled this clock in themselves — quantities derived from a fractional
    // user-set clock are deliberate precision and must not snap to whole numbers.
    group.clockSetByUser = true
    updatingOverclock.value = true
    if (timeout.value) {
      clearTimeout(timeout.value)
    }

    const runId = ++updateRunId
    timeout.value = setTimeout(async () => {
      console.log('Updating building group overclock')
      updateBuildingGroup(group)
      updateFactory(props.factory, { useBuildingGroupBuildings: true, forceRebalance: false, origin: 'buildingGroup' })
      eventBus.emit('buildingGroupUpdated', props.factory)
      // Hold the spinner until the recalc's DOM updates have painted.
      await afterRender()
      if (runId === updateRunId) {
        updatingOverclock.value = false
      }
      console.log('Overclock updated')
    }, 250)
  }

  const deleteGroup = (group: BuildingGroup) => {
    deleteBuildingGroup(props.item, group)

    // We need to now update the factory as the parts will be out of sync.
    updateFactory(props.factory, { useBuildingGroupBuildings: true, forceRebalance: false, origin: 'buildingGroup' })
  }

  const hasByProduct = computed(() => {
    return isByProduct(props.group.type)
  })

  const isByProduct = (groupType: ItemType) => {
    let subject: FactoryItem | FactoryPowerProducer
    if (groupType === ItemType.Product) {
      subject = props.item as FactoryItem
      return subject.byProducts && subject.byProducts.length > 0 && subject.byProducts[0].id
    } else if (groupType === ItemType.Power) {
      subject = props.item as FactoryPowerProducer
      return subject.byproduct
    } else {
      throw new Error('BuildingGroup: isByProduct: Invalid type!')
    }
  }

  const partIsByProduct = (part: string, groupType: ItemType) => {
    if (!hasByProduct.value) return false
    let subject = props.item as FactoryItem | FactoryPowerProducer

    if (groupType === ItemType.Product) {
      subject = props.item as FactoryItem
      if (!subject.byProducts?.length) {
        throw new Error('BuildingGroup: Somehow checking for byproduct on a FactoryItem that does not exist!')
      }
      return part === subject.byProducts[0].id
    } else if (groupType === ItemType.Power) {
      subject = props.item as FactoryPowerProducer
      return part === subject.byproduct?.part
    } else {
      throw new Error('BuildingGroup: partIsByProduct: Invalid type!')
    }
  }

  const chipColors = (part: string) => {
    const isRaw = props.factory.parts[part].isRaw
    const isByProduct = partIsByProduct(part, props.group.type)

    return {
      cyan: isRaw && !isByProduct,
      blue: !isRaw && !isByProduct,
      byproduct: isByProduct,
    }
  }

  const underchipColors = (part: string) => {
    const isRaw = props.factory.parts[part].isRaw
    const isByProduct = partIsByProduct(part, props.group.type)

    return {
      'text-product': !isRaw && !isByProduct,
      'text-cyan': isRaw && !isByProduct,
      'text-byproduct': isByProduct,
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

    const runId = ++updateRunId
    timeout.value = setTimeout(async () => {
      console.log('Updating building group parts')
      updateBuildingGroupViaPart(
        props.group,
        props.item,
        props.group.type,
        props.factory,
        part,
        props.group.parts[part],
      )
      updateFactory(props.factory, { useBuildingGroupBuildings: true, forceRebalance: false, origin: 'buildingGroup' })
      eventBus.emit('buildingGroupUpdated', props.factory)
      // Hold the spinner until the recalc's DOM updates have painted.
      await afterRender()
      if (runId === updateRunId) {
        updatingPart.value = ''
      }
      console.log(`Part ${part} updated`)
    }, 250)
  }
</script>

<style lang="scss" scoped>
// Alien Power Augmenter circuit boost colour (single source: src/utils/colors.ts)
.text-boost {
  color: var(--sf-circuit-boost);
}

// A building group chip is a row of discrete controls — an icon, a value, a chevron — with no
// flowing text, so lay it out as a flex row centred on the chip's own middle. Vuetify leaves
// each piece on its own baseline, which at this size shows up as an icon a couple of pixels
// high and a chevron a couple low.
:deep(.v-chip__content) {
  display: flex;
  align-items: center;
}

// Each column is a chip stacked on its caption, and the two are rarely the same width —
// a variable-power range under a clock chip is far wider than the input. Centre them on
// each other so the chips stay on one visual line whatever the caption says.
.building-group-row > div {
  display: flex;
  flex-direction: column;
  align-items: center;
}

// A select sitting inside a chip alongside other inputs. Vuetify sizes the control for a
// labelled field: the chevron is top-aligned in a taller box and the input reserves trailing
// space, which reads as a gap after "Miner Mk.1". Centre both and tighten the padding.
.chip-select {
  // The plain-underlined variant reserves space above the field for a floating label these
  // selects don't have, which leaves the value and chevron sitting below the chip's centre.
  padding-top: 0;

  :deep(.v-field) {
    align-items: center;
  }

  :deep(.v-field__input) {
    align-items: center;
    min-height: 0;
    padding: 0 0 0 8px;
  }

  :deep(.v-field__append-inner) {
    align-items: center;
    padding-top: 0;
    margin-inline-start: 0;

    .v-icon {
      font-size: 20px;
      opacity: 0.85;
    }
  }
}

.underchip {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  font-size: 0.8rem;
}
</style>
