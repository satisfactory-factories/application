<template>
  <v-table class="rounded border-md sub-card">
    <thead>
      <tr>
        <th class="text-h6 text-left border-e-md" scope="row">
          <i class="fas fa-box" /><span class="ml-2">Item</span>
        </th>
        <th class="d-flex text-h6 border-e-md align-center justify-center" scope="row">
          <i class="fas fa-abacus" /><span class="ml-2">Satisfaction</span>
          <span class="ml-2 text-caption text-grey">
            <v-tooltip bottom>
              <template #activator="{ props }">
                <div v-bind="props">
                  <v-icon
                    icon="fas fa-info-circle"
                  />
                </div>
              </template>
              <span>Amount of the item that is available after internal production needs and other export requests are taken into account.<br>This amount is available for other factories to import.</span>
            </v-tooltip>
          </span>
        </th>
        <th class="text-h6 text-center" scope="row">
          <i class="fas fa-truck-container" /><span class="ml-2">Exports</span>
        </th>
      </tr>
    </thead>
    <tbody>
      <template v-for="(part, partId) in factory.parts" :key="partId">
        <tr>
          <td class="border-e-md name" :class="satisfactionShading(part)">
            <div class="d-flex justify-space-between">
              <div class="d-flex align-center" :class="classes(part)">
                <game-asset
                  height="48"
                  :subject="partId.toString()"
                  type="item"
                  width="48"
                />
                <span v-if="part.satisfied" class="ml-2">
                  <v-icon icon="fas fa-check" />
                </span>
                <span v-else class="ml-2">
                  <v-icon icon="fas fa-times" />
                </span>
                <div class="ml-2 text-body-1">
                  <div>
                    <b>{{ getPartDisplayName(partId.toString()) }}</b>
                  </div>
                  <v-chip v-if="showProductChip(factory, partId.toString())" class="sf-chip blue x-small mr-2">
                    Product
                  </v-chip>
                  <v-chip v-if="showByProductChip(factory, partId.toString())" class="sf-chip gray x-small mr-2">
                    Byproduct
                  </v-chip>
                  <v-chip v-if="showImportedChip(factory, partId.toString())" class="sf-chip gray x-small mr-2">
                    Imported
                  </v-chip>
                  <v-chip v-if="showRawChip(factory, partId.toString())" class="sf-chip cyan x-small mr-2">
                    Raw
                  </v-chip>
                  <v-chip v-if="showInternalChip(factory, partId.toString())" class="sf-chip green x-small mr-2">
                    Internal
                  </v-chip>
                </div>
              </div>
              <!-- Action buttons -->
              <div class="align-self-center text-right">
                <v-btn
                  v-if="showSatisfactionItemButton(factory, partId.toString(), 'addProduct')"
                  class="d-block mb-1"
                  color="primary"
                  size="small"
                  variant="outlined"
                  @click="addProduct(factory, partId.toString(), part.amountRemaining)"
                >
                  +&nbsp;<i class="fas fa-cube" /><span class="ml-1">Product</span>
                </v-btn>
                <v-btn
                  v-if="showSatisfactionItemButton(factory, partId.toString(), 'addGenerator')"
                  class="d-block mb-1"
                  color="yellow-darken-3"
                  size="small"
                  variant="outlined"
                  @click="addGenerator(factory, partId.toString(), part.amountRemaining)"
                >
                  +&nbsp;<i class="fas fa-bolt mr-0" style="max-height: 16px" /><span class="ml-1">Generator</span>
                </v-btn>
                <v-btn
                  v-if="showSatisfactionItemButton(factory, partId.toString(), 'fixProduct')"
                  class="d-block my-1"
                  color="green"
                  size="small"
                  @click="doFixProduct(partId.toString(), factory)"
                >
                  <i class="fas fa-wrench" /><span class="ml-1">Fix Product</span>
                </v-btn>
                <v-btn
                  v-if="showSatisfactionItemButton(factory, partId.toString(), 'correctManually')"
                  class="d-block my-1"
                  color="grey"
                  :ripple="false"
                  size="small"
                  variant="outlined"
                >
                  <v-tooltip bottom>
                    <template #activator="{ props }">
                      <div v-bind="props">
                        <i class="fas fa-exclamation-circle" /><span class="ml-1">CORRECT MANUALLY</span>
                      </div>
                    </template>
                    <span>This item is a byproduct, currently the planner does not know how to scale byproducts correctly<br> as there could be a number of ways to do it that the user may not want.<br> Please scale it manually.</span>
                  </v-tooltip>
                </v-btn>
                <v-btn
                  v-if="showSatisfactionItemButton(factory, partId.toString(), 'fixImport') === true"
                  class="d-block mt-1"
                  color="green"
                  size="small"
                  @click="fixSatisfactionImport(factory, partId.toString())"
                >
                  &nbsp;<i class="fas fa-arrow-up" /><span class="ml-1">Fix Import</span>
                </v-btn>
                <v-btn
                  v-if="showSatisfactionItemButton(factory, partId.toString(), 'fixImport') === 'multiple'"
                  class="d-block my-1"
                  color="grey"
                  :ripple="false"
                  size="small"
                  variant="outlined"
                >
                  <v-tooltip bottom>
                    <template #activator="{ props }">
                      <div v-bind="props">
                        <i class="fas fa-exclamation-circle" /><span class="ml-1">Fix Import</span>
                      </div>
                    </template>
                    <span>There are multiple Imports for this Item. The planner doesn't know which one you would want to be fixed.<br>Please correct manually by using the Satisfy buttons in the Imports section.</span>
                  </v-tooltip>
                </v-btn>
              </div>
            </div>
          </td>
          <td class="border-e-md satisfaction" :class="satisfactionShading(part)">
            <div v-if="satisfactionBreakdowns">
              <div class="text-green d-flex justify-space-between align-center">
                <span>Production</span>
                <span class="align-self-end text-right">
                  +{{ formatNumber(part.amountSuppliedViaProduction) }}/min
                </span>
              </div>
              <div class="text-green d-flex justify-space-between align-center">
                <span>Supply from Imports</span>
                <span class="align-self-end text-right">
                  +{{ formatNumber(part.amountSuppliedViaInput ) }}/min
                </span>
              </div>
              <div class="text-green d-flex justify-space-between align-center">
                <span>Supply from Raw</span>
                <span class="align-self-end text-right">
                  +{{ formatNumber(part.amountSuppliedViaRaw ) }}/min
                </span>
              </div>
              <div class="text-orange d-flex justify-space-between align-center">
                <span>Internal Consumption</span>
                <span class="align-self-end text-right">
                  -{{ formatNumber((part.amountRequiredProduction + part.amountRequiredPower)) }}/min
                </span>
              </div>
              <div class="text-orange d-flex justify-space-between align-center">
                <span>Exports</span>
                <span class="align-self-end text-right">
                  -{{ formatNumber(part.amountRequiredExports ) }}/min
                </span>
              </div>
              <v-divider class="my-2" color="#ccc" />
            </div>
            <div class="text-center">
              <v-chip
                class="sf-chip small"
                :class="part.satisfied ? 'green' : 'red'"
              >
                <b>{{ formatNumber(part.amountRemaining) }}/min {{ getSatisfactionLabel(part.amountRemaining) }}</b>
              </v-chip>
              <template v-if="showRawChip(factory, partId.toString())">
                <v-tooltip bottom>
                  <template #activator="{ props }">
                    <v-chip v-bind="props" class="sf-chip cyan small">
                      <i class="fas fa-info-circle" /><span class="ml-1">Raw</span>
                    </v-chip>
                  </template>
                  <span>Raw Items e.g. Iron Ore are always satisfied. Expand the Satisfaction Breakdowns or look at the Imports section for details of how much is needed.</span>
                </v-tooltip>
              </template>
            </div>
          </td>
          <td :class="satisfactionShading(part)">
            <p v-if="getRequestsForFactoryByPart(factory, partId.toString()).length === 0" class="text-center">
              -
            </p>
            <div v-else>
              <div>
                <v-chip
                  v-for="(request) in getRequestsForFactoryByPart(factory, partId.toString())"
                  :key="`${partId}-${request.requestingFactoryId}`"
                  class="sf-chip small"
                  :color="isRequestSelected(factory, request.requestingFactoryId, partId.toString()) ? 'primary' : ''"
                  :style="isRequestSelected(factory, request.requestingFactoryId, partId.toString()) ? 'border-color: rgb(0, 123, 255) !important' : ''"
                  @click="changeCalculatorSelection(factory, request.requestingFactoryId, partId.toString())"
                >
                  <i class="fas fa-industry" />
                  <span class="ml-2">
                    <b>{{ findFactory(request.requestingFactoryId).name }}</b>: {{ formatNumber(request.amount) }}/min
                  </span>
                </v-chip>
              </div>
              <!--              <div class="text-center mt-2">-->
              <!--                <v-btn-->
              <!--                  color="primary"-->
              <!--                  density="comfortable"-->
              <!--                  variant="outlined"-->
              <!--                  @click="openCalculator(factory.id.toString(), partId.toString())"-->
              <!--                >-->
              <!--                  <i class="fas fa-calculator" /><span class="ml-2">Open Calculator</span>-->
              <!--                </v-btn>-->
              <!--              </div>-->
            </div>
          </td>
        </tr>
        <tr
          v-if="getRequestsForFactoryByPart(factory, partId.toString()).length > 0"
        >
          <td class="calculator-row" colspan="5" style="height: auto">
            <div class="calculator" :class="{ open: openedCalculator === partId }">
              <p class="text-h5">Calculator for {{ getPartDisplayName(partId.toString()) }}</p>
            <!-- Calculator content here -->
            </div>
          </td>
        </tr>
      </template>
    </tbody>
  </v-table>
</template>

<script setup lang="ts">
  import { inject } from 'vue'
  import { getPartDisplayName } from '@/utils/helpers'
  import {
    Factory,
    PartMetrics,
  } from '@/interfaces/planner/FactoryInterface'
  import { addProductToFactory, fixProduct, getProduct } from '@/utils/factory-management/products'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { getRequestsForFactoryByPart } from '@/utils/factory-management/exports'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useAppStore } from '@/stores/app-store'
  import {
    convertWasteToGeneratorFuel,
    showByProductChip,
    showImportedChip,
    showInternalChip,
    showProductChip,
    showRawChip,
    showSatisfactionItemButton,
  } from '@/utils/factory-management/satisfaction'
  import { getInput } from '@/utils/factory-management/inputs'
  import { addPowerProducerToFactory } from '@/utils/factory-management/power'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const findFactory = inject('findFactory') as (factoryId: string | number) => Factory

  const appStore = useAppStore()

  const { getDefaultRecipeForPart, getGeneratorFuelRecipeByPart } = useGameDataStore()
  const openedCalculator = ref('')
  const satisfactionBreakdowns = appStore.getSatisfactionBreakdowns()

  defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const classes = (part: PartMetrics) => {
    return {
      'text-green': part.satisfied,
      'text-red': !part.satisfied,
    }
  }

  const satisfactionShading = (part: PartMetrics) => {
    return {
      'border-green': part.satisfied,
      'border-red': !part.satisfied,
    }
  }

  const addProduct = (factory: Factory, part: string, amount: number): void => {
    addProductToFactory(factory, {
      id: part,
      amount: Math.abs(amount),
      recipe: getDefaultRecipeForPart(part),
    })

    updateFactory(factory)
  }

  const addGenerator = (factory: Factory, part: string, amount: number): void => {
    const recipe = getGeneratorFuelRecipeByPart(part)

    if (!recipe) {
      console.error(`Could not find generator fuel recipe for part ${part}`)
      return
    }

    console.log('addGenerator', factory, part, amount)

    // We need to add the power producer first so the DOM renders it.
    // We need to change the ingredients after the fact because reactivity doesn't work correctly with the byproduct display. It needs a calculation.
    addPowerProducerToFactory(factory, {
      building: 'generatornuclear',
      ingredientAmount: 1,
      recipe: recipe.id,
      updated: 'ingredient',
    })

    updateFactory(factory)

    // Get the producer which should be the latest one in the array
    const producer = factory.powerProducers[factory.powerProducers.length - 1]

    producer.ingredientAmount = convertWasteToGeneratorFuel(recipe, Math.abs(amount))
    updateFactory(factory)
  }

  const fixSatisfactionImport = (factory: Factory, partIndex: string) => {
    const itemImport = getInput(factory, partIndex)

    // If the import is not found
    if (!itemImport) {
      console.error(`Could not find import for ${partIndex} to fix!`)
      return
    }

    // Set the import amount to the required amount
    itemImport.amount = factory.parts[partIndex].amountRequired
    updateFactory(factory)
  }

  const changeCalculatorSelection = (factory: Factory, requestFacId: number, part: string) => {
    factory.exportCalculator[part].selected = requestFacId.toString()
  }

  const isRequestSelected = (factory: Factory, factoryId: number, part: string) => {
    if (!factory.exportCalculator[part]) {
      // console.error(`Could not find export calculator settings for part ${part}`)
      return false
    }
    return factory.exportCalculator[part]?.selected === factoryId.toString()
  }

  const getSatisfactionLabel = (total: number) => {
    return total >= 0 ? 'surplus' : 'shortage'
  }

  const doFixProduct = (partId: string, factory: Factory) => {
    const product = getProduct(factory, partId)

    if (!product) {
      alert('Could not fix the product due to there not being a product! Please report this to Discord with a share link, quoting the factory in question.')
      console.error(`Could not find product for part ${partId}`)
      return
    }
    fixProduct(product, factory)
    updateFactory(factory)
  }

  // const getCalculatorSettings = (factory: Factory, part: string | null): ExportCalculatorSettings | undefined => {
  //   if (part === null) {
  //     console.error(`Could not get calculator settings for invalid part ${part}`)
  //     return undefined
  //   }
  //   return factory.exportCalculator[part]
  // }
  //
  // const getRequestForPartByDestFac = (factory: Factory, part: string, destFacId: string): FactoryDependencyRequest | undefined => {
  //   // Get the requests, then filter by the requesting factory to get the exact request for the port
  //   const requests = factory.dependencies.requests[destFacId]
  //   if (!requests) {
  //     return undefined
  //   }
  //   return requests.find(request => request.part === part)
  // }

  // const openCalculator = (factoryId: string, partId: string) => {
  //   if (openedCalculator.value === partId) {
  //     // Close the currently opened calculator
  //     openedCalculator.value = ''
  //   } else {
  //     // Open the clicked calculator and close others
  //     openedCalculator.value = partId
  //   }
  // }
</script>

<style lang="scss" scoped>
table {
  tbody {
    tr {
      td {
        padding: 0.5rem 1rem !important;
        transition: background 0.5s ease-out !important;
        border-block: thin solid #4b4b4b !important;

        &.border-red {
          background: rgba(128, 0, 0, 0.50) !important;
          border-block: thin solid #b50000 !important;
        }

        &.name {
          height: 78px !important;
          width: 500px;
        }

        &.calculator-row {
          padding: 0 !important;
          border-block: 0 !important;
        }

        &.satisfaction {
          width: 300px
        }
      }
    }
  }
}

.calculator {
  overflow: hidden;
  max-height: 0; /* Collapsed by default */
  transition: max-height 0.5s ease, padding 0.5s ease;

  &.open {
    max-height: 200px; /* Adjust based on expected content height */
    padding: 1rem; /* Optional padding animation */
  }
}

.calculator-content {
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
}
</style>
