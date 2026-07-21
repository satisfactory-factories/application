<template>
  <div
    v-for="(producer, producerIndex) in factory.powerProducers"
    :key="`${factory.id}-${producerIndex}`"
    class="powerProducer factory-item px-4 my-2 border-md rounded sub-card"
  >
    <div class="factory-item-controls">
      <v-btn
        :color="producer.displayOrder === 0 ? 'grey-darken-3' : 'primary'"
        :disabled="producer.displayOrder === 0"
        icon="fas fa-arrow-up"
        size="small"
        variant="flat"
        @click="updatePowerProducerOrder('up', producer)"
      />
      <v-btn
        :color="producer.displayOrder === factory.powerProducers.length - 1 ? 'grey-darken-3' : 'primary'"
        :disabled="producer.displayOrder === factory.powerProducers.length - 1"
        icon="fas fa-arrow-down"
        size="small"
        variant="flat"
        @click="updatePowerProducerOrder('down', producer)"
      />
      <v-btn
        color="red"
        icon="fas fa-trash"
        size="small"
        variant="flat"
        @click="deletePowerProducer(producerIndex, factory)"
      />
    </div>
    <div class="selectors mt-3 mb-2 d-flex flex-column flex-md-row ga-3">
      <div class="input-row d-flex align-center">
        <span v-show="!producer.building" class="mr-2">
          <i class="fas fa-building" style="width: 42px; height: 42px" />
        </span>
        <span v-if="producer.building" class="mr-2">
          <game-asset
            :key="`${producerIndex}-${producer.building}`"
            clickable
            height="42px"
            :subject="producer.building"
            type="building"
            width="42px"
          />
        </span>
        <v-autocomplete
          :id="`${factory.id}-${producer.id}-building`"
          v-model="producer.building"
          hide-details
          :items="autocompletePowerProducerGenerator()"
          label="Generator"
          max-width="250px"
          variant="outlined"
          width="250px"
          @update:model-value="updatePowerProducerSelection(FactoryPowerChangeType.Building, producer, factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <span v-if="producer.recipe && getItemFromFuelRecipe(producer.recipe)" class="mr-2">
          <game-asset
            :key="producer.recipe"
            clickable
            height="42px"
            :subject="getItemFromFuelRecipe(producer.recipe)"
            type="item"
            width="42px"
          />
        </span>
        <span v-else class="mr-2">
          <i class="fas fa-burn" style="width: 42px; height: 42px" />
        </span>
        <v-autocomplete
          :id="`${factory.id}-${producer.id}-recipe`"
          v-model="producer.recipe"
          :disabled="!producer.building"
          hide-details
          :items="getRecipesForPowerProducerSelector(producer.building)"
          :label="producer.building === 'geothermalgenerator' ? 'Node Purity' : 'Fuel'"
          max-width="235px"
          variant="outlined"
          width="235px"
          @update:model-value="updatePowerProducerSelection('recipe', producer, factory)"
        />
      </div>
      <div v-if="!isFuellessProducer(producer)" class="input-row d-flex align-center">
        <v-number-input
          :id="`${factory.id}-${producer.id}-fuel-quantity`"
          v-model="producer.fuelAmount"
          control-variant="stacked"
          :disabled="!producer.recipe"
          hide-details
          label="Fuel Qty/min"
          :min="0"
          type="number"
          variant="outlined"
          :width="smAndDown ? undefined : '130px'"
          @update:model-value="updatePowerProducerFigures(FactoryPowerChangeType.Fuel, producer, factory)"
        />
        <debounce-spinner :active="pendingRecalc === `${producer.id}-${FactoryPowerChangeType.Fuel}`" />
      </div>
      <div v-if="!isFuellessProducer(producer)" class="d-flex align-center font-weight-bold"><span>OR</span></div>
      <div class="input-row d-flex align-center">
        <!-- Fuel-less generators output fixed steps of power per building, so the MW value
             cannot be freely dialled in — it is display-only for them. -->
        <v-number-input
          :id="`${factory.id}-${producer.id}-power-amount`"
          v-model="producer.powerAmount"
          control-variant="stacked"
          :disabled="!producer.recipe || isFuellessProducer(producer)"
          hide-details
          label="MW"
          :min="0"
          type="number"
          variant="outlined"
          :width="smAndDown ? undefined : '130px'"
          @update:model-value="updatePowerProducerFigures(FactoryPowerChangeType.Power, producer, factory)"
        />
        <debounce-spinner :active="pendingRecalc === `${producer.id}-${FactoryPowerChangeType.Power}`" />
      </div>
      <v-chip
        class="align-self-center sf-chip green"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <i class="fas fa-plus" />
        <span class="ml-2">{{ formatMw(producer.powerAmount) }}</span>
        <template v-if="producerHasVariablePower(producer)">
          <span class="ml-1">({{ formatMw(producerPowerRange(producer).min) }} – {{ formatMw(producerPowerRange(producer).max) }})</span>
          <tooltip-info text="This generator's output oscillates between a minimum and maximum over a one-minute cycle. The main figure is the average." />
        </template>
      </v-chip>
    </div>
    <div
      v-if="producer.recipe"
      class="text-body-1 mb-2"
    >
      <div
        v-if="producer.byproduct"
        class="d-flex align-center"
      >
        <p class="mr-2">Byproduct:</p>
        <v-chip class="sf-chip input byproduct">
          <tooltip :text="getPartDisplayName(producer.byproduct.part)">
            <game-asset clickable :subject="producer.byproduct.part" type="item" />
          </tooltip>
          <v-number-input
            v-model="producer.byproduct.amount"
            class="inline-inputs ml-0"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :min="0.001"
            :name="`${producer.id}.byproduct.${producer.byproduct.part.toString()}`"
            :producer="producer.id"
            width="120px"
            @update:model-value="updatePowerProducerFigures(FactoryPowerChangeType.Ingredient, producer, factory)"
          />
          <span>/min</span>
        </v-chip>
      </div>
      <div class="d-flex align-center">
        <p class="mr-2">Requires:</p>
        <v-chip
          v-if="isFuellessProducer(producer) && producer.ingredients[0]"
          :id="`${factory.id}-${producer.id}-matrix-demand`"
          class="sf-chip blue input"
          variant="tonal"
        >
          <tooltip :text="getPartDisplayName(producer.ingredients[0].part)">
            <game-asset clickable :subject="producer.ingredients[0].part" type="item" />
          </tooltip>
          <span class="ml-2 mr-4"><b>{{ formatNumber(producer.ingredients[0].perMin) }}</b>/min</span>
        </v-chip>
        <v-chip
          v-if="producer.ingredients[1]"
          class="sf-chip blue input"
          :class="factory.parts[producer.ingredients[1].part.toString()].isRaw ? 'cyan': 'blue'"
          variant="tonal"
        >
          <tooltip :text="getPartDisplayName(producer.ingredients[1].part)">
            <game-asset clickable :subject="producer.ingredients[1].part" type="item" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${producer.id}-${producer.ingredients[1].part.toString()}`"
            v-model="producer.ingredients[1].perMin"
            class="inline-inputs ml-0"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :min="0.001"
            :producer="producer.id"
            width="120px"
            @update:model-value="updatePowerProducerFigures(FactoryPowerChangeType.Ingredient, producer, factory)"
          />
          <span>/min</span>
        </v-chip>
        <span>
          <v-chip
            class="sf-chip orange input"
            variant="tonal"
          >
            <game-asset :key="`${producerIndex}-${producer.building}`" clickable :subject="producer.building" type="building" />
            <span>
              <b>{{ getBuildingDisplayName(producer.building) }}</b>
            </span>
            <v-number-input
              :id="`${factory.id}-${producer.id}-building-count`"
              v-model="producer.buildingAmount"
              class="inline-inputs ml-0"
              control-variant="stacked"
              density="compact"
              hide-details
              hide-spin-buttons
              :min="0.001"
              :producer="producer.id"
              width="120px"
              @update:model-value="updatePowerProducerFigures(FactoryPowerChangeType.Building, producer, factory)"
            />
            <debounce-spinner :active="pendingRecalc === `${producer.id}-${FactoryPowerChangeType.Building}`" />
          </v-chip>
        </span>
      </div>
    </div>
    <!-- Geothermal generators have no overclock, fuel or somersloops — building groups
         would only echo the building count, so they are hidden entirely. -->
    <building-groups-section
      v-if="producer.building && producer.building !== 'geothermalgenerator'"
      :building="producer.building"
      :factory="factory"
      :id-prefix="`${factory.id}-power-${producerIndex}`"
      :item="producer"
      :type="ItemType.Power"
    />
  </div>
</template>
<script setup lang="ts">
  import { formatMw, formatNumber } from '@/utils/numberFormatter'
  import { getPartDisplayName } from '@/utils/helpers'
  import { useDisplay } from 'vuetify'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { Factory, FactoryPowerChangeType, FactoryPowerProducer, ItemType } from '@/interfaces/planner/FactoryInterface'
  import { PowerRecipe } from '@/interfaces/Recipes'
  import { inject } from 'vue'
  import { deleteItem, getBuildingDisplayName } from '@/utils/factory-management/common'
  import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'
  import { useDebouncedAction } from '@/composables/useDebouncedAction'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  // Numeric edits mutate the producer instantly; only the recalculation is debounced.
  const { debouncing: pendingRecalc, runDebounced } = useDebouncedAction()
  const updateOrder = inject('updateOrder') as (list: any[], direction: string, item: any) => void

  const { smAndDown } = useDisplay()
  const {
    getPowerRecipeById,
    getRecipesForPowerProducer,
    getDefaultRecipeForPowerProducer,
    getGameData,
  } = useGameDataStore()

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const deletePowerProducer = (index: number, factory: Factory) => {
    deleteItem(index, ItemType.Power, factory)
    updateFactory(factory)
  }

  const autocompletePowerProducerGenerator = (): { title: string, value: string }[] => {
    // Loop through all the power production recipes and extrapolate a list of buildings.
    // We're going to use a set here to ensure the list is unique.
    const buildings = new Set<string>()

    getGameData().powerGenerationRecipes.forEach(recipe => {
      buildings.add(recipe.building.name)
    })

    const buildingsArray: string[] = [...buildings.values()]

    // Sort
    buildingsArray.sort((a, b) => a.localeCompare(b))

    const data = buildingsArray.map(building => {
      return {
        title: getBuildingDisplayName(building),
        value: building,
      }
    })
    return data ?? []
  }

  const getRecipesForPowerProducerSelector = (part: string) => {
    return getRecipesForPowerProducer(part).map(recipe => {
      // Each recipe has a bit of a weird displayName where it repeats the building name and the item it's using.
      // We want to shorten this to just the item name.
      // E.g. "Nuclear Power Plant (Ficsonium Fuel Rod) -> Ficsonium Fuel Rod"
      // Fuel-less recipes (e.g. Alien Power Augmenter) have no parenthesised item.
      return {
        title: recipe.displayName.includes('(') ? recipe.displayName.split('(')[1].split(')')[0] : recipe.displayName,
        value: recipe.id,
      }
    })
  }

  const getItemFromFuelRecipe = (recipe: string) => {
    const fuelRecipe = getPowerRecipeById(recipe)
    if (!fuelRecipe) {
      return ''
    }

    return fuelRecipe.ingredients[0]?.part ?? ''
  }

  // Geothermal Generators and Alien Power Augmenters have no fuel input.
  const isFuellessProducer = (producer: FactoryPowerProducer): boolean => {
    if (!producer.recipe) {
      return false
    }

    return (getPowerRecipeById(producer.recipe)?.ingredients.length ?? 0) === 0
  }

  // Min/max output across the groups for variable-output generators (Geothermal).
  const producerPowerRange = (producer: FactoryPowerProducer) => {
    let min = 0
    let max = 0

    producer.buildingGroups.forEach(group => {
      min += group.powerProducedMin ?? group.powerProduced
      max += group.powerProducedMax ?? group.powerProduced
    })

    return { min, max }
  }

  const producerHasVariablePower = (producer: FactoryPowerProducer) => {
    const range = producerPowerRange(producer)
    return range.max !== range.min
  }

  const updatePowerProducerSelection = (source: 'building' | 'recipe', producer: FactoryPowerProducer, factory: Factory) => {
    // Since the user has selected a new building, we need to reset the building groups
    producer.buildingGroups = []

    // Hmmm tastes like chicken!
    let originalRecipe: PowerRecipe | null = JSON.parse(JSON.stringify(getDefaultRecipeForPowerProducer(producer.building)))

    // Replace the recipe with the one newly selected
    if (source === 'recipe') {
      originalRecipe = JSON.parse(JSON.stringify(getPowerRecipeById(producer.recipe))) // Shallow copy
    }

    if (!originalRecipe) {
      console.error('No recipe found for power producer!', producer)
      alert('Unable to find recipe for power generator! Please report this to Discord!')
      return
    }

    const recipe = structuredClone(toRaw(originalRecipe)) // We need to perform a clone here otherwise we end up manipulating the game data version, which is REALLY bad.

    producer.recipe = recipe.id
    producer.ingredients = recipe.ingredients
    producer.powerAmount = 0
    producer.fuelAmount = 0
    producer.byproduct = null

    // Patch the ingredients to be zeroed
    producer.ingredients.forEach(ingredient => {
      ingredient.perMin = 0
    })

    // Make it so that one building is added by default
    producer.buildingAmount = 1
    producer.updated = FactoryPowerChangeType.Building

    // Add a building group in
    addPowerProducerBuildingGroup(producer, factory, true)

    updateFactory(factory)
  }

  const updatePowerProducerFigures = (
    type: FactoryPowerChangeType,
    producer: FactoryPowerProducer,
    factory: Factory
  ) => {
    // All derived work (clamping included — it rewrites the field) waits for the debounce.
    runDebounced(`${producer.id}-${type}`, () => {
      producer.updated = type

      // If user has tried to enter zeros for any inputs, zero it
      if (producer.fuelAmount < 0) {
        producer.fuelAmount = 0
      }
      if (producer.powerAmount < 0) {
        producer.powerAmount = 0
      }
      if (producer.buildingAmount < 0) {
        producer.buildingAmount = 0
      }
      updateFactory(factory)
    })
  }

  const updatePowerProducerOrder = (direction: 'up' | 'down', producer: FactoryPowerProducer) => {
    updateOrder(props.factory.powerProducers, direction, producer)
  }

</script>

<style lang="scss" scoped>
  .powerProducer {
    border-left: 5px solid #ff9800 !important
  }
</style>
