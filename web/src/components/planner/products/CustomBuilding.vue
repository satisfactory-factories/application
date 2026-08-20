<template>
  <div
    v-for="(customBuilding, buildingIndex) in factory.customBuildings"
    :id="`${factory.id}-products-item-${customBuilding.building}`"
    :key="`${factory.id}-custom-${buildingIndex}`"
    class="customBuilding factory-item px-4 my-2 border-md rounded sub-card"
  >
    <div class="factory-item-controls">
      <v-btn
        :color="customBuilding.displayOrder === 0 ? 'grey-darken-3' : 'primary'"
        :disabled="customBuilding.displayOrder === 0"
        icon="fas fa-arrow-up"
        size="small"
        variant="flat"
        @click="updateCustomBuildingOrder('up', customBuilding)"
      />
      <v-btn
        :color="customBuilding.displayOrder === factory.customBuildings.length - 1 ? 'grey-darken-3' : 'primary'"
        :disabled="customBuilding.displayOrder === factory.customBuildings.length - 1"
        icon="fas fa-arrow-down"
        size="small"
        variant="flat"
        @click="updateCustomBuildingOrder('down', customBuilding)"
      />
      <v-btn
        color="red"
        icon="fas fa-trash"
        size="small"
        variant="flat"
        @click="deleteBuilding(buildingIndex, factory)"
      />
    </div>
    <div class="selectors mt-3 mb-2 d-flex flex-column flex-md-row ga-3">
      <div class="input-row d-flex align-center">
        <span v-if="customBuilding.building" class="mr-2">
          <game-asset
            :key="`${buildingIndex}-${customBuilding.building}`"
            clickable
            height="42px"
            :subject="customBuilding.building"
            type="building"
            width="42px"
          />
        </span>
        <span v-else class="mr-2">
          <i class="fas fa-building" style="width: 42px; height: 42px" />
        </span>
        <v-autocomplete
          :id="`${factory.id}-${customBuilding.id}-building`"
          v-model="customBuilding.building"
          hide-details
          :items="buildingSelectorItems"
          label="Building"
          max-width="250px"
          variant="outlined"
          width="250px"
          @update:model-value="updateCustomBuildingSelection(customBuilding, factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <v-number-input
          :id="`${factory.id}-${customBuilding.id}-amount`"
          :key="amountFieldKeys[customBuilding.id] ?? 0"
          control-variant="stacked"
          :disabled="!customBuilding.building"
          hide-details
          label="Qty"
          :min="0"
          :model-value="customBuilding.amount"
          :step="1"
          type="number"
          variant="outlined"
          :width="smAndDown ? undefined : '130px'"
          @update:model-value="value => updateCustomBuildingFigures(value, customBuilding, factory)"
        />
        <debounce-spinner :active="pendingRecalc === customBuilding.id" />
      </div>
      <v-chip
        v-if="customBuilding.building"
        class="align-self-center sf-chip consumption"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <i class="fas fa-minus" />
        <span class="ml-2">{{ formatMw(customBuilding.powerConsumed) }}</span>
      </v-chip>
    </div>
    <div
      v-if="customBuilding.building"
      class="text-body-1 mb-2"
    >
      <div v-if="customBuilding.ingredients.length > 0" class="d-flex align-center flex-wrap">
        <p class="mr-2">Requires:</p>
        <v-chip
          v-for="ingredient in customBuilding.ingredients"
          :id="`${factory.id}-${customBuilding.id}-${ingredient.part}`"
          :key="`${customBuilding.id}-${ingredient.part}`"
          class="sf-chip blue input"
          variant="tonal"
        >
          <tooltip :text="getPartDisplayName(ingredient.part)">
            <game-asset clickable :subject="ingredient.part" type="item" />
          </tooltip>
          <!-- `.sf-chip.input` zeroes its horizontal padding for the chips that hold an inline
               number input, so a read-only figure has to bring its own right gutter. Same
               spacing as the power producer's matrix demand chip, which is the same shape. -->
          <span class="ml-2 mr-4"><b>{{ formatNumber(ingredient.perMin) }}</b>/min</span>
        </v-chip>
        <tooltip-info
          :text="upkeepHelpText(customBuilding)"
        />
      </div>
      <p v-else class="text-body-2 upkeep-note">
        <i class="fas fa-info-circle mr-1" />
        Draws power only — nothing has to be delivered to it.
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, inject, nextTick, ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import { formatMw, formatNumber } from '@/utils/numberFormatter'
  import { getPartDisplayName } from '@/utils/helpers'
  import { Factory, FactoryCustomBuilding } from '@/interfaces/planner/FactoryInterface'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { deleteCustomBuilding } from '@/utils/factory-management/custom-buildings'
  import { useDebouncedAction } from '@/composables/useDebouncedAction'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const updateOrder = inject('updateOrder') as (list: any[], direction: string, item: any) => void
  // The count mutates instantly; only the recalculation it triggers is debounced.
  const { debouncing: pendingRecalc, runDebounced } = useDebouncedAction()

  const { smAndDown } = useDisplay()
  const { getCustomBuildings, getCustomBuildingByName } = useGameDataStore()

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  // One remount counter per row, bumped when a typed quantity had to be corrected.
  const amountFieldKeys = ref<Record<string, number>>({})

  const buildingSelectorItems = computed(() => getCustomBuildings().map(building => ({
    title: building.displayName,
    value: building.name,
  })))

  const upkeepHelpText = (customBuilding: FactoryCustomBuilding): string => {
    const building = getCustomBuildingByName(customBuilding.building)
    const rates = (building?.ingredients ?? [])
      .map(ingredient => `${formatNumber(ingredient.perMin)}/min of ${getPartDisplayName(ingredient.part)}`)
      .join(', ')

    return `Each ${building?.displayName ?? 'building'} consumes ${rates} while running.<br>` +
      'The figure shown is for all of them, and is added to this factory\'s demands — import it like any other part.'
  }

  const deleteBuilding = (index: number, factory: Factory) => {
    deleteCustomBuilding(index, factory)
    updateFactory(factory)
  }

  // Swapping the building keeps the count: the user is saying "these are portals, not stations",
  // not starting again. The power and upkeep behind it are rebuilt by the engine.
  const updateCustomBuildingSelection = (customBuilding: FactoryCustomBuilding, factory: Factory) => {
    if (customBuilding.amount <= 0) {
      customBuilding.amount = 1
    }

    updateFactory(factory)
  }

  // Clamp on entry rather than in the debounce. Vuetify keeps the typed text regardless of the
  // model, so a rejected value left on screen reads as though the planner accepted it while the
  // calculation quietly uses another number — the somersloop bug of Beta v0.5.
  const updateCustomBuildingFigures = (
    value: number | null,
    customBuilding: FactoryCustomBuilding,
    factory: Factory
  ) => {
    const typed = Number(value)
    // Whole buildings only: there is no clock on a portal, so a fraction would price a building
    // nobody can place. Rounded up, matching what the engine settles on.
    const clamped = Number.isFinite(typed) ? Math.max(0, Math.ceil(typed)) : 0
    const corrected = clamped !== typed

    customBuilding.amount = clamped

    if (corrected) {
      // Remount the field so it shows the number being calculated with, then hand focus back.
      amountFieldKeys.value[customBuilding.id] = (amountFieldKeys.value[customBuilding.id] ?? 0) + 1
      nextTick(() => document.getElementById(`${factory.id}-${customBuilding.id}-amount`)?.focus())
    }

    runDebounced(customBuilding.id, () => {
      updateFactory(factory)
    })
  }

  const updateCustomBuildingOrder = (direction: 'up' | 'down', customBuilding: FactoryCustomBuilding) => {
    updateOrder(props.factory.customBuildings, direction, customBuilding)
  }
</script>

<style lang="scss" scoped>
  .customBuilding {
    border-left: 5px solid var(--sf-building) !important
  }

  .upkeep-note {
    color: rgba(255, 255, 255, 0.7);
  }
</style>
