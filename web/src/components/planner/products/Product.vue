<template>
  <div
    v-for="(product, productIndex) in factory.products"
    :key="productIndex"
    class="product px-4 my-2 border-md rounded sub-card"
  >
    <div class="selectors mt-3 mb-2 d-flex flex-column flex-md-row ga-3">
      <div class="input-row d-flex align-center">
        <span v-show="!product.id" class="mr-2">
          <i class="fas fa-cube" style="width: 32px; height: 32px" />
        </span>
        <span v-if="product.id" class="mr-2">
          <game-asset
            :key="product.id"
            height="42px"
            :subject="product.id"
            type="item"
            width="42px"
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
          :name="`${product.id}.amount`"
          type="number"
          variant="outlined"
          @input="updateFactory(factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <v-btn
          v-if="!isProductionSatisfied(factory, product.id) || !isExportSatisfied(factory, product.id)"
          class="rounded mr-2"
          color="green"
          @click="onClickFixProduction(factory, product.id)"
        ><i class="fas fa-wrench" /><span class="ml-1">Fix</span>
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
          @click="updateProductOrder('up', product)"
        />
        <v-btn
          class="rounded mr-2"
          color="blue"
          :disabled="product.displayOrder === factory.products.length - 1"
          icon="fas fa-arrow-down"
          size="small"
          variant="outlined"
          @click="updateProductOrder('down', product)"
        />
        <v-btn
          class="rounded"
          color="red"
          icon="fas fa-trash"
          size="small"
          variant="outlined"
          @click="deleteProduct(productIndex, factory)"
        />
        <v-chip v-if="shouldShowInternal(product, factory)" class="ml-2 sf-chip small green">
          Internal
        </v-chip>
        <v-chip v-if="shouldShowNotInDemand(product, factory)" class="ml-2 sf-chip small orange">
          No demand!
        </v-chip>
      </div>
    </div>
    <div
      v-if="product.recipe"
      class="text-body-1 mb-2"
    >
      <div
        v-if="product.byProducts && product.byProducts.length > 0"
        class="d-flex align-center"
      >
        <p class="mr-2">Byproduct:</p>
        <v-chip
          v-for="byProduct in product.byProducts"
          :key="byProduct.id"
          class="sf-chip"
        >
          <game-asset :subject="byProduct.id" type="item" />
          <span class="ml-2">
            <b>{{ getPartDisplayName(byProduct.id) }}</b>:
          </span>

          <v-text-field
            v-model.number="byProduct.amount"
            class="inline-inputs product-secondary-input"
            flat
            hide-details
            hide-spin-buttons
            min="0"
            :name="`${product.id}.byProducts.${byProduct.id}`"
            :product="product.id"
            type="number"
            width="60px"
            @input="setProductQtyByByproduct(product, byProduct.id)"
          />
          <span>
            /min
          </span>
        </v-chip>
      </div>
      <div
        v-if="Object.keys(product.requirements).length > 0 || product.buildingRequirements"
        class="d-flex flex-sm-wrap align-center"
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
            <b>{{ getPartDisplayName(part.toString()) }}</b>:
          </span>
          <v-text-field
            v-model.number="requirement.amount"
            class="inline-inputs product-secondary-input"
            flat
            hide-details
            hide-spin-buttons
            min="0"
            :name="`${product.id}.ingredients.${part}`"
            :product="product.id"
            type="number"
            width="60px"
            @input="setProductQtyByRequirement(product, part.toString())"
          />
          <span>/min</span>
        </v-chip>
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
            :name="`${product.id}.buildingAmount`"
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
          <i class="fas fa-minus" />
          <span class="ml-2">{{ formatPower(product.buildingRequirements.powerConsumed ?? 0).value }} {{ formatPower(product.buildingRequirements.powerConsumed ?? 0).unit }}</span>
        </v-chip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import {
    shouldShowInternal,
    shouldShowNotInDemand,
    shouldShowTrim,
    trimProduct,
  } from '@/utils/factory-management/products'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatPower } from '@/utils/numberFormatter'
  import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { useDisplay } from 'vuetify'
  import { inject } from 'vue'

  const fixProduction = inject('fixProduction') as (factory: Factory, partIndex: string) => void
  const fixExport = inject('fixExport') as (factory: Factory, productId: string) => void
  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const updateOrder = inject('updateOrder') as (list: any[], direction: string, item: any) => void
  const getBuildingDisplayName = inject('getBuildingDisplayName') as (part: string) => string

  const { smAndDown } = useDisplay()
  const {
    getRecipesForPart,
    getDefaultRecipeForPart,
    getRecipeById,
    getGameData,
  } = useGameDataStore()

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const deleteProduct = (outputIndex: number, factory: Factory) => {
    factory.products.splice(outputIndex, 1)

    // We need to loop through each one in order and fix their ordering with the running count
    factory.products.forEach((product, index) => {
      product.displayOrder = index
    })
    updateFactory(factory)
  }

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

  // Enables the user to move the order of the byproduct up or down
  const updateProductOrder = (direction: 'up' | 'down', product: FactoryItem) => {
    updateOrder(props.factory.products, direction, product)
  }

  type Recipe = NonNullable<ReturnType<typeof getRecipeById>>

  const recipeIngredientPerMinGetter = (part: string) => {
    return (recipe: Recipe) => {
      const ingredient = recipe.ingredients.find(i => i.part === part)
      if (!ingredient) {
        console.error('No ingredient found for part', part, ' in recipe ', recipe)
        throw new Error('No ingredient found for part!')
      }
      return ingredient.perMin
    }
  }
  const recipeByproductPerMinGetter = (part: string) => {
    return (recipe: Recipe) => {
      // Seems byproduct is used in power recipes
      const byproduct = [...recipe.products, ...(recipe.byproduct ?? [])].find(bp => bp.part === part)
      if (!byproduct) {
        console.error('No byproduct found for part', part, ' in recipe ', recipe)
        throw new Error('No byproduct found for part!')
      }
      return byproduct.perMin
    }
  }

  const getProductQtyByAmount = (product: FactoryItem, getAmountFromRecipe: (recipe: Recipe) => number, newAmount: number | undefined) => {
    if (!newAmount || newAmount < 0) {
      return 0
    }
    const recipe = getRecipeById(product.recipe)
    if (!recipe) {
      console.error('No recipe found for product!', product)
      throw new Error('No recipe found for product!')
    }
    const recipeAmount = getAmountFromRecipe(recipe)
    if (!recipeAmount) {
      return 0
    }
    return recipe.products[0].perMin * newAmount / recipeAmount
  }

  const setProductQtyByByproduct = (product: FactoryItem, part: string) => {
    const byProduct = product.byProducts?.find(bp => bp.id === part)
    if (!byProduct) {
      console.error('No byproduct ', part, ' found for product ', product)
      throw new Error('No byproduct found for product!')
    }
    product.amount = getProductQtyByAmount(product, recipeByproductPerMinGetter(part), byProduct.amount)
    updateFactory(props.factory)
  }

  const setProductQtyByRequirement = (product: FactoryItem, part: string) => {
    const ingredient = product.requirements[part]
    if (!ingredient) {
      console.error('No ingredient ', part, ' found for product ', product)
      throw new Error('No ingredient found for product!')
    }
    product.amount = getProductQtyByAmount(product, recipeIngredientPerMinGetter(part), ingredient.amount)
    updateFactory(props.factory)
  }

  const increaseProductQtyByBuilding = (product: FactoryItem) => {
    // Get what is now the new buildingRequirement for the product
    const newVal = product.buildingRequirements.amount

    if (newVal < 0 || !newVal) {
      product.buildingRequirements.amount = 0 // Prevents the product being totally deleted
      return
    }

    // Get the recipe for the product in order to get the new quantity
    const recipe = getRecipeById(product.recipe)

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

  const isProductionSatisfied = (factory: Factory, id: string) => factory.parts[id]?.satisfied
  const isExportSatisfied = (factory: Factory, id: string) => factory.dependencies.metrics[id]?.difference >= 0

  const onClickFixProduction = (factory: Factory, id: string) => {
    if (!isProductionSatisfied(factory, id)) {
      fixProduction(factory, id)
    }

    if (!isExportSatisfied(factory, id)) {
      fixExport(factory, id)
    }
  }

  const autocompletePartItemsGenerator = () => {
    const gameDataParts = getGameData().items.parts
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

</script>

<style lang="scss" scoped>
  .product {
    border-left: 5px solid #2196f3 !important
  }
  div.product-secondary-input:deep(input) {
    // Match input's font size to the rest of the requirement chip
    font-size: 0.875rem;
  }
</style>
