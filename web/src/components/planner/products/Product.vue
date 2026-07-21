<template>
  <div
    v-for="(product, productIndex) in factory.products"
    :key="productIndex"
    class="factory-item px-4 my-2 border-md rounded sub-card"
  >
    <div class="factory-item-controls">
      <v-btn
        :color="product.displayOrder === 0 ? 'grey-darken-3' : 'primary'"
        :disabled="product.displayOrder === 0"
        icon="fas fa-arrow-up"
        size="small"
        variant="flat"
        @click="updateProductOrder('up', product)"
      />
      <v-btn
        :color="product.displayOrder === factory.products.length - 1 ? 'grey-darken-3' : 'primary'"
        :disabled="product.displayOrder === factory.products.length - 1"
        icon="fas fa-arrow-down"
        size="small"
        variant="flat"
        @click="updateProductOrder('down', product)"
      />
      <v-btn
        :id="`${factory.id}-item-${productIndex}-delete`"
        color="red"
        icon="fas fa-trash"
        size="small"
        variant="flat"
        @click="deleteProduct(productIndex, factory)"
      />
    </div>
    <div class="selectors mt-3 mb-2 d-flex flex-column flex-md-row ga-3">
      <div class="input-row d-flex align-center">
        <span v-show="!product.id" class="mr-2">
          <i class="fas fa-cube" style="width: 32px; height: 32px" />
        </span>
        <span v-if="product.id" class="mr-2">
          <game-asset
            :key="product.id"
            clickable
            height="42px"
            :subject="product.id"
            type="item"
            width="42px"
          />
        </span>
        <v-autocomplete
          :id="`${factory.id}-${product.id}-item`"
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
          :id="`${factory.id}-${product.id}-amount`"
          v-model="product.amount"
          control-variant="stacked"
          hide-details
          label="Qty /min"
          variant="outlined"
          :width="smAndDown ? undefined : '130px'"
          @update:model-value="updateProductQty(product, factory)"
        />
        <debounce-spinner :active="debouncingProduct === product.id && debouncing === 'amount'" />
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
          <v-chip class="sf-chip input unit byproduct">
            <tooltip :text="getPartDisplayName(byProduct.id)">
              <game-asset clickable :subject="String(byProduct.id)" type="item" />
            </tooltip>
            <v-number-input
              v-model="byProduct.amount"
              class="inline-inputs ml-0"
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
            <debounce-spinner :active="pendingRecalc === `${product.id}-bp-${byProduct.id}`" />
          </v-chip>
          <v-chip v-if="shouldShowInternal(byProduct, factory)" class="sf-chip small green">
            Internal
          </v-chip>
        </template>
      </div>
      <div
        v-if="Object.keys(product.requirements).length > 0 || product.buildingRequirements"
        class="d-flex flex-wrap align-center mb-1"
      >
        <p class="mr-2">Requires:</p>
        <v-chip
          class="sf-chip orange input"
          variant="tonal"
        >
          <game-asset :key="`${product.id}-${product.buildingRequirements.name}`" clickable :subject="product.buildingRequirements.name" type="building" />
          <span>
            <b>{{ getBuildingDisplayName(product.buildingRequirements.name) }}</b>
          </span>
          <v-number-input
            :id="`${factory.id}-${product.id}-building-count`"
            class="inline-inputs ml-2"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :model-value="formatNumberFully(product.buildingRequirements.amount)"
            :product="product.id"
            width="120px"
            @update:model-value="changeBuildingAmountInput(product, $event)"
          />
          <debounce-spinner :active="pendingRecalc === `${product.id}-buildings`" />
        </v-chip>
        <v-chip
          class="sf-chip consumption"
          variant="tonal"
        >
          <i class="fas fa-bolt" />
          <i class="fas fa-minus" />
          <span class="ml-2">{{ productPowerConsumed(product) }}</span>
          <template v-if="productHasVariablePower(product)">
            <span class="ml-1">({{ formatMw(productPowerRange(product).min) }} – {{ formatMw(productPowerRange(product).max) }})</span>
            <tooltip-info text="This building's power draw oscillates between a minimum and maximum over the recipe cycle. The main figure is the average." />
          </template>
        </v-chip>
        <v-chip
          v-for="(requirement, part) in product.requirements"
          :key="`ingredients-${part}`"
          class="sf-chip input unit"
          :class="factory.parts[part].isRaw ? 'cyan': 'blue'"
          variant="tonal"
        >
          <tooltip :text="getPartDisplayName(part)">
            <game-asset clickable :subject="String(part)" type="item" />
          </tooltip>
          <v-number-input
            :id="`${factory.id}-${product.id}-${part}-amount`"
            v-model="requirement.amount"
            class="inline-inputs ml-0"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :min="0"
            :product="product.id"
            width="120px"
            @update:model-value="setProductQtyByRequirement(product, part.toString())"
          />
          <span>/min</span>
          <debounce-spinner :active="pendingRecalc === `${product.id}-req-${part}`" />
        </v-chip>
      </div>
    </div>
    <!-- Hidden entirely until the product has a valid item + recipe — an
         inert bar for a half-configured product is just noise. -->
    <building-groups-section
      v-if="product.id && product.recipe"
      :building="product.buildingRequirements.name"
      :factory="factory"
      :id-prefix="`${factory.id}-${product.id}`"
      :item="product"
      :type="ItemType.Product"
    />
  </div>
</template>

<script setup lang="ts">
  import {
    byProductAsProductCheck,
    fixProduct,
    increaseProductQtyViaBuilding,
    shouldShowFix,
    shouldShowInternal,
    shouldShowNotInDemand,
    updateProductAmountViaByproduct,
    updateProductAmountViaRequirement,
  } from '@/utils/factory-management/products'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatMw, formatNumberFully } from '@/utils/numberFormatter'
  import { Factory, FactoryItem, ItemType } from '@/interfaces/planner/FactoryInterface'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { useDisplay } from 'vuetify'
  import { deleteItem, getBuildingDisplayName, getRecipe } from '@/utils/factory-management/common'
  import { inject } from 'vue'
  import { debounce } from '@/components/planner/products/ItemCommon'
  import { useDebouncedAction } from '@/composables/useDebouncedAction'
  import eventBus from '@/utils/eventBus'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const updateOrder = inject('updateOrder') as (list: any[], direction: string, item: any) => void

  const debouncing = ref('')
  const debouncingProduct = ref('')
  // Secondary inputs (ingredients, byproducts, building count): the value mutation
  // lands instantly, only the whole-plan recalculation is debounced behind this.
  const { debouncing: pendingRecalc, runDebounced } = useDebouncedAction()

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
    if (mdAndDown.value) {
      width = '275px'
    }
    if (smAndDown.value) {
      width = '200px'
    }

    return width
  })

  const recipeSelectionWidth = computed(() => {
    let width = '300px'
    if (mdAndDown.value) {
      width = '275px'
    }
    if (smAndDown.value) {
      width = '200px'
    }

    return width
  })

  const deleteProduct = (index: number, factory: Factory) => {
    deleteItem(index, ItemType.Product, factory)
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

    if (product.recipe) {
      const recipe = getRecipe(product.recipe, gameData)
      if (!recipe) {
        console.warn(`Product: Unable to get recipe for ${product.id}!`)
        product.amount = 1
      } else {
        product.amount = recipe.products[0].perMin
      }
    }

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

  let updateQtyCallCounter = 0
  const updateProductQty = async (product: FactoryItem, factory: Factory) => {
    if (product.amount === 0) {
      // The user may be typing a decimal point starting with zero, so leave them alone
      return
    }

    // Negative amounts break the calculations, clamp them to a sane minimum.
    if (product.amount < 0) {
      product.amount = 1
    }

    // Get a unique call ID for the update
    const callId = ++updateQtyCallCounter
    console.log('updateProductQty: callId', callId)

    // Show debouncing to user
    debouncingProduct.value = product.id
    debouncing.value = 'amount'

    // Copy the input value
    const oldAmount = formatNumberFully(JSON.parse(JSON.stringify(product.amount)))

    await debounce()

    // If the call ID is not the latest, ignore this call
    if (callId !== updateQtyCallCounter) {
      console.log('updateProductQty: ignoring call as not latest', callId)
      return
    }

    updateFactory(factory)
    debouncing.value = ''
    debouncingProduct.value = ''

    const newAmount = formatNumberFully(product.amount)

    console.log('amounts', oldAmount, newAmount, oldAmount !== newAmount)

    // If the amount was not what the user entered, show a toast
    if (oldAmount !== newAmount) {
      eventBus.emit('toast', {
        message: `Amount you entered is incalculable under current conditions e.g. building group could not be split evenly. Updated to closest possible.`,
        type: 'warning',
        timeout: 3000,
      })
    }
  }

  // Enables the user to move the order of the byproduct up or down
  const updateProductOrder = (direction: 'up' | 'down', product: FactoryItem) => {
    updateOrder(props.factory.products, direction, product)
  }

  const setProductQtyByByproduct = (product: FactoryItem, part: string) => {
    const productAmount = product.byProducts?.find(bp => bp.id === part)?.amount ?? 0
    if (productAmount === 0) {
      // The user may be typing a decimal point starting with zero, so leave them alone
      return
    }
    // Even the local reverse-solve waits for the debounce — running it per keystroke
    // updates dependent displays (and triggers renders) while the user is still typing.
    runDebounced(`${product.id}-bp-${part}`, () => {
      updateProductAmountViaByproduct(product, part, gameData)
      updateFactory(props.factory)
    })
  }

  const setProductQtyByRequirement = (product: FactoryItem, part: string) => {
    if (product.requirements[part].amount === 0) {
      // The user may be typing a decimal point starting with zero, so leave them alone
      return
    }
    runDebounced(`${product.id}-req-${part}`, () => {
      updateProductAmountViaRequirement(product, part)
      updateFactory(props.factory)
    })
  }

  const changeBuildingAmount = (product: FactoryItem) => {
    if (product.buildingRequirements.amount === 0) {
      // The user may be typing a decimal point starting with zero, so leave them alone
      return
    }

    runDebounced(`${product.id}-buildings`, () => {
      increaseProductQtyViaBuilding(product, props.factory, gameData)
      updateFactory(props.factory)
    })
  }

  // The input displays a formatted value (the raw one carries float noise like
  // 1.3333333333333333), so user edits must be written back to the data here.
  const changeBuildingAmountInput = (product: FactoryItem, value: number | string) => {
    product.buildingRequirements.amount = Number(value)
    changeBuildingAmount(product)
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

  const productPowerConsumed = (product: FactoryItem) => {
    let totalPower = 0

    // Loop all of the building groups and sum the power consumed
    product.buildingGroups.forEach(group => {
      totalPower += group.powerUsage
    })

    return formatMw(totalPower ?? 0)
  }

  // Min/max draw across the groups for variable-power buildings (equal to the average otherwise).
  const productPowerRange = (product: FactoryItem) => {
    let min = 0
    let max = 0

    product.buildingGroups.forEach(group => {
      min += group.powerUsageMin ?? group.powerUsage
      max += group.powerUsageMax ?? group.powerUsage
    })

    return { min, max }
  }

  const productHasVariablePower = (product: FactoryItem) => {
    const range = productPowerRange(product)
    return range.max !== range.min
  }
</script>
