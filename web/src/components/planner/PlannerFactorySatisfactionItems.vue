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
        <th class="text-h6 text-center" scope="row" />
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
            <p v-if="getPartExportRequests(factory, partId.toString()).length === 0" class="text-center">
              -
            </p>
            <div v-else>
              <div>
                <v-chip
                  v-for="(request) in getPartExportRequests(factory, partId.toString())"
                  :key="`${partId}-${request.requestingFactoryId}`"
                  class="sf-chip small"
                  :color="isRequestSelected(factory, request.requestingFactoryId.toString(), partId.toString()) ? 'primary' : ''"
                  :style="isRequestSelected(factory, request.requestingFactoryId.toString(), partId.toString()) ? 'border-color: rgb(0, 123, 255) !important' : ''"
                  @click="initCalculator(factory, partId.toString(), request.requestingFactoryId)"
                >
                  <i class="fas fa-industry" />
                  <span class="ml-2">
                    <b>{{ findFactory(request.requestingFactoryId).name }}</b>: {{ formatNumber(request.amount) }}/min
                  </span>
                </v-chip>
              </div>
            </div>
          </td>
          <td class="text-right" :class="satisfactionShading(part)" style="width: 40px">
            <v-btn
              v-if="openedCalculator !== partId && getPartExportRequests(factory, partId.toString()).length > 0"
              class="rounded"
              color="primary"
              icon="fas fa-calculator"
              size="small"
              title="Export Calculator"
              variant="outlined"
              @click="initCalculator(factory, partId.toString())"
            />
            <v-btn
              v-if="openedCalculator === partId"
              class="rounded"
              color="primary"
              icon="fas fa-arrow-up"
              size="small"
              title="Close Export Calculator"
              variant="outlined"
              @click="openedCalculator = ''"
            />
          </td>
        </tr>
        <tr
          v-if="openedCalculator === partId && getPartExportRequests(factory, partId.toString()).length > 0"
        >
          <td class="calculator-row" colspan="5" style="height: auto">
            <div class="calculator-tray" :class="{ open: openedCalculator === partId }">
              <export-calculator :key="partId + factory.exportCalculator[partId].selected" :factory="factory" :part="partId.toString()" />
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
  import { getPartExportRequests } from '@/utils/factory-management/exports'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useAppStore } from '@/stores/app-store'
  import {
    showByProductChip,
    showImportedChip, showInternalChip,
    showProductChip, showRawChip,
    showSatisfactionItemButton,
  } from '@/utils/factory-management/satisfaction'
  import { getInput } from '@/utils/factory-management/inputs'
  import ExportCalculator from '@/components/planner/satisfaction/calculator/ExportCalculator.vue'
  import {
    initializeCalculatorFactoryPart,
    initializeCalculatorFactorySettings,
  } from '@/utils/factory-management/exportCalculator'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const findFactory = inject('findFactory') as (factoryId: string | number) => Factory

  const appStore = useAppStore()

  const { getDefaultRecipeForPart } = useGameDataStore()
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

  const initCalculator = (factory: Factory, part: string, selectedFactory?: number) => {
    changeCalculatorSelection(factory, selectedFactory, part)
    openedCalculator.value = part
  }

  const changeCalculatorSelection = (factory: Factory, requestFacIdRaw: number | undefined, part: string) => {
    // Ensure requestFacId is a string indexable by an object
    let requestFacId
    if (requestFacIdRaw) {
      requestFacId = String(requestFacIdRaw)
    }
    console.log(`PlannerFactorySatisfactionItems: Changing calculator selection for ${factory.name} part ${part} to factory ${requestFacId}`)
    if (!factory.exportCalculator[part]) {
      console.log(`PlannerFactorySatisfactionItems: Calculator Settings for ${factory.name} part ${part} not initialized, creating it now.`)
      initializeCalculatorFactoryPart(factory, part)
    }

    if (requestFacId) {
      if (!factory.exportCalculator[part].factorySettings[requestFacId]?.trainTime) {
        console.log(`PlannerFactorySatisfactionItems: Calculator Factory settings for ${factory.name} part ${part}, requesting factory ${requestFacId} not initialized, creating it now.`)
        initializeCalculatorFactorySettings(factory, part, requestFacId)
      }
    }

    console.log('changeCalculatorSelection: calculatorSettings', factory.exportCalculator[part])
    console.log('changeCalculatorSelection: requestFacId', requestFacId)

    factory.exportCalculator[part].selected = requestFacId ?? null
  }

  const isRequestSelected = (factory: Factory, factoryId: string, part: string) => {
    if (!factory.exportCalculator[part]) {
      // console.error(`Could not find export calculator settings for part ${part}`)
      return false
    }
    return factory.exportCalculator[part]?.selected === factoryId
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

.calculator-tray {
  overflow: hidden;
  max-height: 0; /* Collapsed by default */
  transition: max-height 0.3s ease, padding 0.3s ease;

  &.open {
    max-height: 500px; /* Adjust based on expected content height */
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
