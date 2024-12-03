<template>
  <div>
    <h1 class="text-h6 text-md-h5 mb-4">
      <i class="fas fa-conveyor-belt-alt" />
      <span class="ml-3">Products</span>
    </h1>
    <p v-show="helpText" class="text-body-2 mb-4">
      <i class="fas fa-info-circle" /> Products that are created within the factory. Products are first
      used to fulfil recipes internally, and any surplus is then shown in Exports for export or
      sinking.<br>
      e.g. if you add 200 Iron Rods and also 100 Screws, you'd have 100 surplus Rods remaining used as an
      Export (and the Screws as a end product).<br>
      An <v-chip color="green">Internal</v-chip> product is one that is used to produce other products. The surplus of which can also be used as an export.
    </p>
    <!-- PRODUCTS -->
    <div
      v-for="(product, productIndex) in factory.products"
      :key="productIndex"
      class="px-4 my-2 border-md rounded sub-card"
    >
      <div class="selectors mt-3 d-flex flex-column flex-md-row ga-3">
        <div class="input-row d-flex align-center">
          <span v-show="!product.id" class="mr-2">
            <i class="fas fa-cube" style="width: 32px; height: 32px" />
          </span>
          <span v-if="product.id" class="mr-2">
            <game-asset
              :key="product.id"
              height="32px"
              :subject="product.id"
              type="item"
              width="32px"
            />
          </span>
          <v-autocomplete
            v-model="product.id"
            hide-details
            :items="autocompletePartItems"
            label="Item"
            max-width="300px"
            variant="outlined"
            width="300px"
            @update:model-value="updateProductSelection(product, factory)"
          />
        </div>
        <div class="input-row d-flex align-center">
          <i class="fas fa-hat-chef mr-2" style="width: 32px; height: 32px" />
          <v-autocomplete
            v-model="product.recipe"
            :disabled="!product.id"
            hide-details
            :items="getRecipesForPartSelector(product.id)"
            label="Recipe"
            max-width="350px"
            variant="outlined"
            width="350px"
            @update:model-value="updateFactory(factory)"
          />
        </div>
        <div class="input-row d-flex align-center">
          <v-text-field
            v-model.number="product.amount"
            hide-details
            label="Qty /min"
            :max-width="smAndDown ? undefined : '110px'"
            :min-width="smAndDown ? undefined : '100px'"
            type="number"
            variant="outlined"
            @input="updateFactory(factory)"
          />
        </div>
        <div class="input-row d-flex align-center">
          <v-btn
            v-if="!factory.parts[product.id]?.satisfied"
            class="rounded mr-2"
            color="green"
            @click="fixProduction(factory, product.id)"
          ><i class="fas fa-wrench" /><span class="ml-1">Fix Production</span>
          </v-btn>
          <v-btn
            v-if="factory.dependencies.metrics[product.id]?.difference < 0"
            class="rounded mr-2"
            color="green"
            @click="fixExport(factory, product.id)"
          ><i class="fas fa-wrench" /><span class="ml-1">Fix Production</span>
          </v-btn>
          <v-btn
            v-show="shouldShowTrim(product, factory)"
            class="rounded mr-2"
            color="yellow"
            prepend-icon="fas fa-arrow-down"
            size="default"
            @click="doTrimProduct(product, factory)"
          >Trim</v-btn>
          <v-btn
            class="rounded mr-2"
            color="blue"
            :disabled="product.displayOrder === 0"
            icon="fas fa-arrow-up"
            size="small"
            variant="outlined"
            @click="updateOrder('up', product)"
          />
          <v-btn
            class="rounded mr-2"
            color="blue"
            :disabled="product.displayOrder === factory.products.length - 1"
            icon="fas fa-arrow-down"
            size="small"
            variant="outlined"
            @click="updateOrder('down', product)"
          />
          <v-btn
            class="rounded"
            color="red"
            icon="fas fa-trash"
            size="small"
            variant="outlined"
            @click="deleteProduct(productIndex, factory)"
          />
          <v-chip v-if="factory.internalProducts[product.id]" class="ml-2" color="sf-chip small green">
            Internal
          </v-chip>
          <v-chip v-if="shouldShowNotInDemand(product, factory)" class=" ml-2 sf-chip small red">
            Not in demand!
          </v-chip>
        </div>
      </div>
      <v-row
        v-if="product.byProducts && product.byProducts.length > 0"
        class="my-2 mb-n1 px-2 text-body-1 d-flex align-center"
      >
        <p class="mr-2">Byproduct:</p>
        <v-chip
          v-for="byProduct in product.byProducts"
          :key="byProduct.id"
          class="sf-chip"
        >
          <game-asset :subject="byProduct.id" type="item" />
          <span class="ml-2">
            <b>{{ getPartDisplayName(byProduct.id) }}</b>: {{ formatNumber(byProduct.amount) }}/min
          </span>
        </v-chip>
      </v-row>
      <v-row
        v-if="Object.keys(product.requirements).length > 0 || product.buildingRequirements.amount > 0 || product.buildingRequirements.totalPower > 0"
        class="my-2 px-2 text-body-1 d-flex align-center"
      >
        <p class="mr-2">Requires:</p>
        <v-chip
          v-for="(requirement, part) in product.requirements"
          :key="`ingredients-${part}`"
          class="sf-chip blue"
          variant="tonal"
        >
          <game-asset :subject="part.toString()" type="item" />
          <span class="ml-2">
            <b>{{ getPartDisplayName(part.toString()) }}</b>: {{ formatNumber(requirement.amount) }}/min
          </span>
        </v-chip>
        <div v-if="product.buildingRequirements.name" class="ml-0 text-body-1 d-inline">
          <span>
            <v-chip
              class="sf-chip orange"
              variant="tonal"
            >
              <game-asset :subject="product.buildingRequirements.name" type="building" />
              <span class="ml-2">
                <b>{{ getBuildingDisplayName(product.buildingRequirements.name) }}</b>:
              </span>
              <v-text-field
                v-model.number="product.buildingRequirements.amount"
                class="inline-inputs"
                flat
                hide-details
                hide-spin-buttons
                min="0"
                :product="product.id"
                type="number"
                width="60px"
                @input="increaseProductQtyByBuilding(product)"
              />
            </v-chip>
            <v-chip
              class="sf-chip yellow"
              variant="tonal"
            >
              <i class="fas fa-bolt" />
              <span class="ml-2">
                {{ formatNumber(product.buildingRequirements.totalPower) }} MW
              </span>
            </v-chip>
          </span>
        </div>
      </v-row>
    </div>
    <!-- END PRODUCTS -->
    <!-- POWER PRODUCERS -->
    <div
      v-for="(producer, producerIndex) in factory.powerProducers"
      :key="producerIndex"
      class="px-4 my-2 border-md rounded sub-card"
    >
      Power Producer

    </div>
    <div class="mt-2">
      <v-btn
        color="primary mr-2"
        prepend-icon="fas fa-cube"
        ripple
        variant="flat"
        @click="addEmptyProduct(factory)"
      >
        Add Product
      </v-btn>
      <v-btn
        color="yellow mr-2"
        prepend-icon="fas fa-bolt"
        ripple
        variant="flat"
        @click="addEmptyPowerProducer(factory)"
      >
        Add Power Generator
      </v-btn>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
  import {
    addPowerProducer,
    addProductToFactory,
    shouldShowNotInDemand,
    shouldShowTrim,
    trimProduct,
  } from '@/utils/factory-management/products'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { useDisplay } from 'vuetify'

  const getBuildingDisplayName = inject('getBuildingDisplayName') as (part: string) => string
  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const fixProduction = inject('fixProduction') as (factory: Factory, partIndex: string) => void
  const fixExport = inject('fixExport') as (factory: Factory, productId: string) => void

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const { smAndDown } = useDisplay()
  const gameDataStore = useGameDataStore()

  const { getRecipesForPart, getDefaultRecipeForPart } = useGameDataStore()

  const addEmptyProduct = (factory: Factory) => {
    addProductToFactory(factory, {
      id: '',
      amount: 1,
    })
  }

  const addEmptyPowerProducer = (factory: Factory) => {
    addPowerProducer(factory, {
      building: '',
      powerAmount: 0,
      fuelRecipe: '',
    })
  }

  const deleteProduct = (outputIndex: number, factory: Factory) => {
    factory.products.splice(outputIndex, 1)

    // We need to loop through each one in order and fix their ordering with the running count
    factory.products.forEach((product, index) => {
      product.displayOrder = index
    })
    updateFactory(factory)
  }

  const autocompletePartItemsGenerator = () => {
    const gameDataParts = gameDataStore.getGameData().items.parts
    const data = Object.keys(gameDataParts).map(part => {
      return {
        title: getPartDisplayName(part),
        value: part,
      }
    })
    data.sort((a, b) => a.title.localeCompare(b.title))

    return data
  }

  const autocompletePartItems = autocompletePartItemsGenerator()

  const getRecipesForPartSelector = (part: string) => {
    // Return each recipe in the format of { title: 'Recipe Name', value: 'Recipe ID' }
    // If there's "Alternate" in the name, shorten it to "Alt" for display.
    return getRecipesForPart(part).map(recipe => {
      return {
        title: recipe.displayName.replace('Alternate', 'Alt'),
        value: recipe.id,
      }
    })
  }

  const updateProductSelection = (product: FactoryItem, factory: Factory) => {
    product.recipe = getDefaultRecipeForPart(product.id)
    product.amount = 1

    updateFactory(factory)
  }

  // Enables the user to move the order of the products up or down
  const updateOrder = (direction: 'up' | 'down', product: FactoryItem) => {
    const index = props.factory.products.findIndex(p => p.displayOrder === product.displayOrder)
    const newIndex = direction === 'up' ? index - 1 : index + 1

    if (newIndex < 0 || newIndex >= props.factory.products.length) {
      return
    }

    const otherProduct = props.factory.products.find(p => p.displayOrder === newIndex)
    if (!otherProduct) {
      return
    }

    const tempOrder = product.displayOrder
    product.displayOrder = otherProduct.displayOrder
    otherProduct.displayOrder = tempOrder

    props.factory.products.sort((a, b) => a.displayOrder - b.displayOrder)
  }

  const increaseProductQtyByBuilding = (product: FactoryItem) => {
    // Get what is now the new buildingRequirement for the product
    const newVal = product.buildingRequirements.amount

    if (newVal < 0 || !newVal) {
      product.buildingRequirements.amount = 0 // Prevents the product being totally deleted
      return
    }

    // Get the recipe for the product in order to get the new quantity
    const recipe = gameDataStore.getRecipeById(product.recipe)

    if (!recipe) {
      console.error('No recipe found for product!', product)
      throw new Error('No recipe found for product!')
    }

    // Set the new quantity of the product
    product.amount = recipe.products[0].perMin * newVal

    updateFactory(props.factory)
  }

  const doTrimProduct = (product: FactoryItem, factory: Factory) => {
    trimProduct(product, factory)
    updateFactory(factory)
  }

</script>

<style lang="scss" scoped>
  .input-row {
    max-width: 100%;
  }
</style>
