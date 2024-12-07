<template>
  <div
    v-for="(producer, producerIndex) in factory.powerProducers"
    :key="producerIndex"
    class="powerProducer px-4 my-2 border-md rounded sub-card"
  >
    <div class="selectors mt-3 mb-2 d-flex flex-column flex-md-row ga-3">
      <div class="input-row d-flex align-center">
        <span v-show="!producer.building" class="mr-2">
          <i class="fas fa-building" style="width: 42px; height: 42px" />
        </span>
        <span v-if="producer.building" class="mr-2">
          <game-asset
            :key="producer.building"
            height="42px"
            :subject="producer.building"
            type="building"
            width="42px"
          />
        </span>
        <v-autocomplete
          v-model="producer.building"
          hide-details
          :items="autocompletePowerProducerGenerator()"
          label="Generator"
          max-width="250px"
          variant="outlined"
          width="250px"
          @update:model-value="updatePowerProducerSelection('building', producer, factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <span v-if="producer.recipe" class="mr-2">
          <game-asset
            :key="producer.recipe"
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
          v-model="producer.recipe"
          :disabled="!producer.building"
          hide-details
          :items="getRecipesForPowerProducerSelector(producer.building)"
          label="Fuel"
          max-width="235px"
          variant="outlined"
          width="235px"
          @update:model-value="updatePowerProducerSelection('recipe', producer, factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <v-text-field
          v-model.number="producer.ingredientAmount"
          :disabled="!producer.recipe"
          hide-details
          label="Fuel Qty/min"
          :max-width="smAndDown ? undefined : '110px'"
          min="0"
          :min-width="smAndDown ? undefined : '100px'"
          type="number"
          variant="outlined"
          @update:model-value="updatePowerProducerFigures('ingredient', producer, factory)"
        />
      </div>
      <div class="d-flex align-center mx-1 font-weight-bold"><span>OR</span></div>
      <div class="input-row d-flex align-center">
        <v-text-field
          v-model.number="producer.powerAmount"
          :disabled="!producer.recipe"
          hide-details
          label="MW"
          :max-width="smAndDown ? undefined : '110px'"
          min="0"
          :min-width="smAndDown ? undefined : '100px'"
          type="number"
          variant="outlined"
          @update:model-value="updatePowerProducerFigures('power', producer, factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <v-btn
          class="rounded mr-2"
          color="blue"
          :disabled="producer.displayOrder === 0"
          icon="fas fa-arrow-up"
          size="small"
          variant="outlined"
          @click="updatePowerProducerOrder('up', producer)"
        />
        <v-btn
          class="rounded mr-2"
          color="blue"
          :disabled="producer.displayOrder === factory.powerProducers.length - 1"
          icon="fas fa-arrow-down"
          size="small"
          variant="outlined"
          @click="updatePowerProducerOrder('down', producer)"
        />
        <v-btn
          class="rounded"
          color="red"
          icon="fas fa-trash"
          size="small"
          variant="outlined"
          @click="deletePowerProducer(producerIndex, factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <v-chip
          class="sf-chip small green"
          variant="tonal"
        >
          <i class="fas fa-solar-panel" />
          <span class="ml-2">
            Produces: {{ formatNumber(producer.powerAmount) }} MW
          </span>
        </v-chip>
      </div>
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
        <v-chip class="sf-chip">
          <game-asset :subject="producer.byproduct.part" type="item" />
          <span class="ml-2">
            <b>{{ getPartDisplayName(producer.byproduct.part) }}</b>: {{ formatNumber(producer.byproduct.amount ?? 0) }}/min
          </span>
        </v-chip>
      </div>
      <div class="d-flex align-center">
        <p class="mr-2">Requires:</p>
        <v-chip
          v-if="producer.ingredients[1]"
          class="sf-chip blue"
          variant="tonal"
        >
          <game-asset :subject="producer.ingredients[1].part" type="item" />
          <span class="ml-2">
            <b>{{ getPartDisplayName(producer.ingredients[1].part.toString()) }}</b>: {{ formatNumber(producer.ingredients[1].perMin) }}/min
          </span>
        </v-chip>
        <span>
          <v-chip
            class="sf-chip orange"
            variant="tonal"
          >
            <game-asset :subject="producer.building" type="building" />
            <span class="ml-2">
              <b>{{ getBuildingDisplayName(producer.building) }}</b>:
            </span>
            <v-text-field
              v-model.number="producer.buildingAmount"
              class="inline-inputs"
              flat
              hide-details
              hide-spin-buttons
              min="0"
              type="number"
              width="60px"
              @input="updatePowerProducerFigures('building', producer, factory)"
            />
          </v-chip>
        </span>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { formatNumber } from '@/utils/numberFormatter'
  import { getPartDisplayName } from '@/utils/helpers'
  import { useDisplay } from 'vuetify'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { Factory, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
  import { PowerRecipe } from '@/interfaces/Recipes'
  import { inject } from 'vue'

  const getBuildingDisplayName = inject('getBuildingDisplayName') as (part: string) => string
  const updateFactory = inject('updateFactory') as (factory: Factory) => void
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
    factory.powerProducers.splice(index, 1)

    // We need to loop through each one in order and fix their ordering with the running count
    factory.powerProducers.forEach((producer, index) => {
      producer.displayOrder = index
    })
    updateFactory(factory)
  }

  const autocompletePowerProducerGenerator = (): {title: string, value: string}[] => {
    // Loop through all the power production recipes and extrapolate a list of buildings.
    // We're going to use a set here to ensure the list is unique.
    const buildings = new Set<string>()

    getGameData().powerGenerationRecipes.forEach(recipe => {
      buildings.add(recipe.building.name)
    })

    const buildingsArray: string[] = buildings.values().toArray()

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
      return {
        title: recipe.displayName.split('(')[1].split(')')[0],
        value: recipe.id,
      }
    })
  }

  const getItemFromFuelRecipe = (recipe: string) => {
    const fuelRecipe = getPowerRecipeById(recipe)
    if (!fuelRecipe) {
      return ''
    }

    return fuelRecipe.ingredients[0].part
  }

  const updatePowerProducerSelection = (source: 'building' | 'recipe', producer: FactoryPowerProducer, factory: Factory) => {
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
    producer.ingredientAmount = 0
    producer.byproduct = null

    // Patch the ingredients to be zeroed
    producer.ingredients.forEach(ingredient => {
      ingredient.perMin = 0
    })

    updateFactory(factory)
  }

  const updatePowerProducerFigures = (type: 'ingredient' | 'power' | 'building', producer: FactoryPowerProducer, factory: Factory) => {
    producer.updated = type

    // If user has tried to enter zeros for any inputs, zero it
    if (producer.ingredientAmount < 0) {
      producer.ingredientAmount = 0
    }
    if (producer.powerAmount < 0) {
      producer.powerAmount = 0
    }
    if (producer.buildingAmount < 0) {
      producer.buildingAmount = 0
    }
    updateFactory(factory)
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
