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
          :max-width="productSelectionWidth"
          variant="outlined"
          :width="productSelectionWidth"
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
          :max-width="recipeSelectionWidth"
          variant="outlined"
          :width="recipeSelectionWidth"
          @update:model-value="updateRecipe(product, factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <v-number-input
          v-model="product.amount"
          control-variant="stacked"
          hide-details
          label="Qty /min"
          :name="`${product.id}.amount`"
          variant="outlined"
          :width="smAndDown ? undefined : '130px'"
          @update:model-value="updateProductQty(product, factory)"
        />
      </div>
      <div class="input-row d-flex align-center">
        <v-btn
          v-show="shouldShowFix(product, factory) == 'deficit'"
          class="rounded mr-2"
          color="green"
          prepend-icon="fas fa-arrow-up"
          @click="doFixProduct(product, factory)"
        >Satisfy</v-btn>
        <v-btn
          v-show="shouldShowFix(product, factory) == 'surplus'"
          class="rounded mr-2"
          color="yellow"
          prepend-icon="fas fa-arrow-down"
          size="default"
          @click="doFixProduct(product, factory)"
        >Trim</v-btn>
        <v-chip v-if="shouldShowInternal(product, factory)" class="ml-2 sf-chip small green">
          Internal
        </v-chip>
        <v-chip v-if="shouldShowNotInDemand(product, factory)" class="ml-2 sf-chip small orange">
          No demand!
        </v-chip>
        <div class="product-controls">
          <v-btn
            v-if="!product.buildingGroupTrayOpen"
            color="amber"
            :disabled="product.buildingGroups.length === 0"
            size="small"
            :variant="product.buildingGroups.length === 0 ? 'outlined' : 'flat'"
            @click="product.buildingGroupTrayOpen = true"
          >
            <v-icon left>fas fa-arrow-down</v-icon><span class="ml-2">Simple <tooltip-info :is-caption="false" text="Open to see Building Groups, enabling you to overclock and apply Somersloops." /></span>
          </v-btn>
          <v-btn
            v-if="product.buildingGroupTrayOpen"
            color="amber"
            :disabled="product.buildingGroups.length === 0"
            size="small"
            :variant="product.buildingGroups.length === 0 ? 'outlined' : 'flat'"
            @click="product.buildingGroupTrayOpen = false"
          >
            <v-icon left>fas fa-arrow-up</v-icon> <span class="ml-2">Advanced</span>
          </v-btn>
          <v-btn
            color="blue"
            :disabled="product.displayOrder === 0"
            icon="fas fa-arrow-up"
            size="small"
            variant="flat"
            @click="updateProductOrder('up', product)"
          />
          <v-btn
            color="blue"
            :disabled="product.displayOrder === factory.products.length - 1"
            icon="fas fa-arrow-down"
            size="small"
            variant="flat"
            @click="updateProductOrder('down', product)"
          />
          <v-btn
            color="red"
            icon="fas fa-trash"
            size="small"
            variant="flat"
            @click="deleteProduct(productIndex, factory)"
          />
        </div>
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
        <template
          v-for="byProduct in product.byProducts"
          :key="byProduct.id"
        >
          <v-chip class="sf-chip input unit">
            <game-asset :subject="byProduct.id" type="item" />
            <span>
              <b>{{ getPartDisplayName(byProduct.id) }}</b>
            </span>

            <v-number-input
              v-model.number="byProduct.amount"
              class="inline-inputs"
              control-variant="stacked"
              density="compact"
              hide-details
              hide-spin-buttons
              :min="0"
              :name="`${product.id}.byProducts.${byProduct.id}`"
              :product="product.id"
              width="120px"
              @update:model-value="setProductQtyByByproduct(product, byProduct.id)"
            />
            <span>/min</span>
          </v-chip>
          <v-chip v-if="shouldShowInternal(byProduct, factory)" class="sf-chip small green">
            Internal
          </v-chip>
        </template>
      </div>
      <div
        v-if="Object.keys(product.requirements).length > 0 || product.buildingRequirements"
        class="d-flex flex-wrap align-center mb-2"
      >
        <p class="mr-2">Requires:</p>
        <v-chip
          v-for="(requirement, part) in product.requirements"
          :key="`ingredients-${part}`"
          class="sf-chip input unit"
          :class="factory.parts[part].isRaw ? 'cyan': 'blue'"
          variant="tonal"
        >
          <tooltip :text="getPartDisplayName(part)">
            <game-asset :subject="String(part)" type="item" />
          </tooltip>
          <v-number-input
            v-model.number="requirement.amount"
            class="inline-inputs"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :min="0"
            :name="`${product.id}.ingredients.${part}`"
            :product="product.id"
            width="120px"
            @update:model-value="setProductQtyByRequirement(product, part.toString())"
          />
          <span>/min</span>
        </v-chip>
        <v-chip
          class="sf-chip orange input"
          variant="tonal"
        >
          <game-asset :key="`${product.id}-${product.buildingRequirements.name}`" :subject="product.buildingRequirements.name" type="building" />
          <span>
            <b>{{ getBuildingDisplayName(product.buildingRequirements.name) }}</b>
          </span>
          <v-number-input
            v-model.number="product.buildingRequirements.amount"
            class="inline-inputs ml-2"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :min="0"
            :name="`${product.id}.buildingAmount`"
            :product="product.id"
            width="120px"
            @update:model-value="changeBuildingAmount(product)"
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
      <div v-if="product.buildingGroupTrayOpen" class="mb-2">
        <building-groups :factory="factory" :product="product" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import {
    byProductAsProductCheck,
    fixProduct, increaseProductQtyViaBuilding,
    shouldShowFix,
    shouldShowInternal,
    shouldShowNotInDemand,
    updateProductAmountViaByproduct,
    updateProductAmountViaRequirement,
  } from '@/utils/factory-management/products'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatPower } from '@/utils/numberFormatter'
  import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { useDisplay } from 'vuetify'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import { inject } from 'vue'
  import eventBus from '@/utils/eventBus'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const updateOrder = inject('updateOrder') as (list: any[], direction: string, item: any) => void

  const { smAndDown, mdAndDown } = useDisplay()
  const {
    getRecipesForPart,
    getDefaultRecipeForPart,
    getGameData,
  } = useGameDataStore()

  const gameData = getGameData()

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const productSelectionWidth = computed(() => {
    let width = '300px'
    if (mdAndDown) {
      width = '275px'
    }
    if (smAndDown) {
      width = '200px'
    }

    return width
  })

  const recipeSelectionWidth = computed(() => {
    let width = '300px'
    if (mdAndDown) {
      width = '275px'
    }
    if (smAndDown) {
      width = '200px'
    }

    return width
  })

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
    // If Uranium Waste or Plutonium Waste are selected, alert the user, and remove it.

    if (product.id === 'NuclearWaste' || product.id === 'PlutoniumWaste') {
      alert('Uranium and Plutonium Waste are created by adding a Power Generator (and adding a Nuclear Power Plant). This product will now be cleared.')
      product.recipe = ''
      product.id = ''
      return
    }

    product.recipe = getDefaultRecipeForPart(product.id)
    product.amount = 1
    // Blow the building groups away, updateFactory will regenerate them
    product.buildingGroups = []

    byProductAsProductCheck(product, gameData)

    updateFactory(factory)
  }

  const updateRecipe = (product: FactoryItem, factory: Factory) => {
    byProductAsProductCheck(product, gameData)

    // Blow the building groups away, updateFactory will regenerate them
    product.buildingGroups = []

    updateFactory(factory)
  }

  const updateProductQty = (product: FactoryItem, factory: Factory) => {
    updateFactory(factory)

    if (product.buildingGroups.length === 1) {
      eventBus.emit('rebalanceGroups', product)
    }
  }

  // Enables the user to move the order of the byproduct up or down
  const updateProductOrder = (direction: 'up' | 'down', product: FactoryItem) => {
    updateOrder(props.factory.products, direction, product)
  }

  const setProductQtyByByproduct = (product: FactoryItem, part: string) => {
    updateProductAmountViaByproduct(product, part, gameData)
    updateFactory(props.factory)
    eventBus.emit('rebalanceGroups', product)
  }

  const setProductQtyByRequirement = (product: FactoryItem, part: string) => {
    updateProductAmountViaRequirement(product, part, gameData)
    updateFactory(props.factory)
  }

  const changeBuildingAmount = (product: FactoryItem) => {
    increaseProductQtyViaBuilding(product, gameData)
    updateFactory(props.factory)
    eventBus.emit('rebalanceGroups', product)
  }

  const doFixProduct = (product: FactoryItem, factory: Factory) => {
    fixProduct(product, factory)
    updateFactory(factory)
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

<style lang="scss">
  .product {
    border-left: 5px solid #2196f3 !important;
    position: relative;
  }

  .product-controls {
    position: absolute;
    right: 0;
    top: -1px;

    .v-btn {
      height: 20px;
      border-radius: 0;
      border-right-width: 2px;

      &:first-child {
        border-top-left-radius: 2px;
        border-bottom-left-radius: 2px;
      }

      &:last-child {
        border-top-right-radius: 2px;
        border-bottom-right-radius: 2px;
        border-right-width: 0;
      }
    }

    .v-btn__content svg {
      height: 14px !important;
    }
  }
</style>
