<template>
  <v-table class="rounded border-md sub-card">
    <thead>
      <tr>
        <th class="text-h6 text-left border-e-md" scope="row">
          <i class="fas fa-box" /><span class="ml-2">Item</span>
        </th>
        <th class="d-flex text-h6 border-e-md align-center justify-center" scope="row">
          <i class="fas fa-balance-scale" /><span class="ml-2">Satisfaction</span>
          <tooltip-info text="Amount of the item that is available after internal production needs and other export requests are taken into account.<br>This amount is available for other factories to import." />
        </th>
        <th class="text-h6 text-center" scope="row">
          <i class="fas fa-truck-container" /><span class="ml-2">Exports</span>
        </th>
        <th class="text-h6 text-center" scope="row" />
      </tr>
    </thead>
    <tbody>
      <template v-for="(part, partId) in filteredParts" :key="partId">
        <tr :id="`${factory.id}-satisfaction-item-${partId}`">
          <td class="border-e-md name" :class="satisfactionShading(part, partId.toString())">
            <div class="d-flex justify-space-between">
              <div class="d-flex align-center" :class="classes(part)">
                <game-asset
                  clickable
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
                  <!-- Each chip leads with the icon its concept wears elsewhere in the app, so a
                       row of them can be read at a glance rather than word by word. -->
                  <v-chip v-if="showProductChip(factory, partId.toString())" class="sf-chip blue x-small mr-2">
                    <i class="fas fa-cube mr-1" />Product
                  </v-chip>
                  <v-chip v-if="showByProductChip(factory, partId.toString())" class="sf-chip byproduct x-small mr-2">
                    <i class="fas fa-cubes mr-1" />Byproduct
                  </v-chip>
                  <v-tooltip v-if="showRecycledChip(factory, partId.toString())" bottom>
                    <template #activator="{ props: activatorProps }">
                      <v-chip v-bind="activatorProps" class="sf-chip green x-small mr-2">
                        <i class="fas fa-recycle mr-1" /><span class="mr-1">Recycled</span> <i class="fas fa-info-circle" />
                      </v-chip>
                    </template>
                    <span>This byproduct is used as an ingredient by other products within the same factory.<br>The planner subtracts it from the amount you need to supply via Imports, so you don't over-feed the system.</span>
                  </v-tooltip>
                  <v-chip v-if="showImportedChip(factory, partId.toString())" class="sf-chip import x-small mr-2">
                    <i class="fas fa-dolly mr-1" />Imported
                  </v-chip>
                  <!-- White to match the factory chips this part's export requests appear as
                       in the Exports column to the right. -->
                  <v-chip v-if="showExportedChip(factory, partId.toString())" class="sf-chip factory x-small mr-2">
                    <i class="fas fa-truck-container mr-1" />Exported
                  </v-chip>
                  <v-chip v-if="showManuallyGatheredChip(factory, partId.toString())" class="sf-chip hand-gathered x-small mr-2">
                    <i class="fas fa-hands mr-1" />Manually gathered
                  </v-chip>
                  <v-chip v-if="showUnpackagedChip(factory, partId.toString())" class="sf-chip cyan x-small mr-2">
                    <i class="fas fa-box-open mr-1" />Unpackaged
                  </v-chip>
                  <v-chip v-if="showInternalChip(factory, partId.toString())" class="sf-chip green x-small mr-2">
                    <i class="fas fa-industry mr-1" />Internal
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
                  v-if="showSatisfactionItemButton(factory, partId.toString(), 'fixGenerator')"
                  class="d-block mb-1"
                  color="green"
                  size="small"
                  variant="outlined"
                  @click="doFixGenerator(factory, partId.toString(), part.amountRequired)"
                >
                  <i class="fas fa-wrench" /><span class="ml-1">Fix Generator</span>
                </v-btn>

                <template v-if="showSatisfactionItemButton(factory, partId.toString(), 'fixGeneratorManually')">
                  <v-btn
                    class="d-block my-1"
                    color="grey"
                    :ripple="false"
                    size="small"
                    variant="outlined"
                  >
                    <v-tooltip bottom>
                      <template #activator="{ props: activatorProps }">
                        <div v-bind="activatorProps">
                          <i class="fas fa-exclamation-circle" /><span class="ml-1">FIX GENS MANUALLY</span>
                        </div>
                      </template>
                      <span>You have multiple Generator groups for this waste. Since the planner cannot read your mind, we don't know which group to fix.<br>Please either fix manually or reduce to one Generator & Fuel group.</span>
                    </v-tooltip>
                  </v-btn>
                  <p class="text-center"><b>+{{ showFuelRodsNeeded(partId.toString(), part.amountRemaining) }}</b> rods needed</p>
                </template>
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
                    <template #activator="{ props: activatorProps }">
                      <div v-bind="activatorProps">
                        <i class="fas fa-exclamation-circle" /><span class="ml-1">CORRECT MANUALLY</span>
                      </div>
                    </template>
                    <span>This item can only be made as a byproduct of something else.<br> The planner does not know how to scale byproducts correctly, as there could be a number of ways to do it that you may not want.<br> Please scale it manually.</span>
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
                    <template #activator="{ props: activatorProps }">
                      <div v-bind="activatorProps">
                        <i class="fas fa-exclamation-circle" /><span class="ml-1">Fix Import</span>
                      </div>
                    </template>
                    <span>There are multiple Imports for this Item. The planner doesn't know which one you would want to be fixed.<br>Please correct manually by using the Satisfy buttons in the Imports section.</span>
                  </v-tooltip>
                </v-btn>
              </div>
            </div>
          </td>
          <td class="border-e-md satisfaction" :class="satisfactionShading(part, partId.toString())">
            <div v-if="satisfactionBreakdowns">
              <div class="text-green d-flex justify-space-between align-center">
                <span>Production</span>
                <span
                  :id="`${ factory.id }-satisfaction-${partId.toString()}-production`"
                  class="align-self-end text-right"
                >
                  +{{ formatNumber(part.amountSuppliedViaProduction) }}/min
                </span>
              </div>
              <div class="text-green d-flex justify-space-between align-center">
                <span>Supply from Imports</span>
                <span
                  :id="`${ factory.id }-satisfaction-${partId.toString()}-supply-input`"
                  class="align-self-end text-right"
                >
                  +{{ formatNumber(part.amountSuppliedViaInput ) }}/min
                </span>
              </div>
              <div class="text-green d-flex justify-space-between align-center">
                <span>Supply from Raw</span>
                <span
                  :id="`${ factory.id }-satisfaction-${partId.toString()}-supply-raw`"
                  class="align-self-end text-right"
                >
                  +{{ formatNumber(part.amountSuppliedViaRaw ) }}/min
                </span>
              </div>
              <div class="text-orange d-flex justify-space-between align-center">
                <span>Internal Consumption</span>
                <span
                  :id="`${ factory.id }-satisfaction-${partId.toString()}-required-production`"
                  class="align-self-end text-right"
                >
                  -{{ formatNumber((part.amountRequiredProduction + part.amountRequiredPower)) }}/min
                </span>
              </div>
              <!-- Custom buildings only, and only when there are any: a portal room's Singularity
                   Cells are consumed by the factory but by nothing it produces, so lumping them
                   into Internal Consumption would read as a recipe eating them. -->
              <div
                v-if="(part.amountRequiredBuildings ?? 0) > 0"
                class="text-orange d-flex justify-space-between align-center"
              >
                <span>Custom Buildings</span>
                <span
                  :id="`${ factory.id }-satisfaction-${partId.toString()}-required-buildings`"
                  class="align-self-end text-right"
                >
                  -{{ formatNumber(part.amountRequiredBuildings ?? 0) }}/min
                </span>
              </div>
              <div class="text-orange d-flex justify-space-between align-center">
                <span>Exports</span>
                <span
                  :id="`${ factory.id }-satisfaction-${partId.toString()}-required-exports`"
                  class="align-self-end text-right"
                >
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
                <b>
                  <span :id="`${factory.id}-satisfaction-${partId.toString()}-remaining`">{{ formatNumber(part.amountRemaining) }}</span>/min {{ getSatisfactionLabel(part.amountRemaining) }}
                </b>
              </v-chip>
              <!-- Blue, and never alongside No demand: an item the game gives no consumer is
                   finished, not spare. -->
              <template v-if="isEndProduct(factory, partId.toString())">
                <v-tooltip bottom>
                  <template #activator="{ props: activatorProps }">
                    <v-chip v-bind="activatorProps" class="sf-chip blue small">
                      <i class="fas fa-flag-checkered mr-2" /><span>End product</span>
                    </v-chip>
                  </template>
                  <span>Nothing in the game consumes this item, so it is the end of its chain.<br>The planner assumes you deliver it to the Space Elevator, or sink it.</span>
                </v-tooltip>
              </template>
              <!-- The byproduct pair, exclusive by construction. Sinkable is the soft one: a way
                   out exists, so the chip says so and the factory stays green. -->
              <template v-if="isPotentialBlockage(factory, partId.toString())">
                <v-tooltip bottom>
                  <template #activator="{ props: activatorProps }">
                    <v-chip v-bind="activatorProps" class="sf-chip status-note small">
                      <i class="fas fa-exclamation-triangle mr-2" /><span>Potential blockage</span>
                    </v-chip>
                  </template>
                  <span>Nothing consumes this byproduct, so it will back up and stall the buildings making it unless you sink it.<br>Blending it into a recipe that consumes it, or exporting it, works too. Support for sinking is coming in a future update.</span>
                </v-tooltip>
              </template>
              <template v-if="isUnhandledByproduct(factory, partId.toString())">
                <v-tooltip bottom>
                  <template #activator="{ props: activatorProps }">
                    <v-chip v-bind="activatorProps" class="sf-chip status-warning small">
                      <i class="fas fa-exclamation-triangle mr-2" /><span>Unhandled byproduct</span>
                    </v-chip>
                  </template>
                  <span>Nothing consumes this byproduct and the AWESOME Sink will not take it, so it fills the machine's output and stalls the buildings making it.<br>Blend it into a recipe that consumes it, or export it to a factory that will.</span>
                </v-tooltip>
              </template>
              <!-- Amber rather than red, and it leaves the factory green: making something
                   nothing asks for is often the whole point of the factory. The two chips above
                   cover the byproduct case, which says the same thing with more consequence. -->
              <template v-if="hasNoDemand(factory, partId.toString()) && !isPotentialBlockage(factory, partId.toString()) && !isUnhandledByproduct(factory, partId.toString())">
                <v-tooltip bottom>
                  <template #activator="{ props: activatorProps }">
                    <!-- No trailing info icon: the question mark already says the chip is
                         explaining itself, and hovering it is how you read the rest. -->
                    <v-chip v-bind="activatorProps" class="sf-chip status-note small">
                      <i class="fas fa-question-circle mr-2" /><span>No demand</span>
                    </v-chip>
                  </template>
                  <span>Nothing asks for this item: no recipe in this factory needs it and no other factory imports it.<br>A future update will add support for sinking, so if you are sinking this, ignore it for now.</span>
                </v-tooltip>
              </template>
              <!-- The balance only needs annotating where the number isn't earned, which is now
                   only ever the resources the game gives you no way to extract. -->
              <template v-if="showManuallyGatheredChip(factory, partId.toString())">
                <v-tooltip bottom>
                  <template #activator="{ props: activatorProps }">
                    <v-chip v-bind="activatorProps" class="sf-chip hand-gathered small">
                      <i class="fas fa-hands mr-2" /><span class="mr-2">{{ formatNumber(part.amountSuppliedViaRaw) }}/min gathered</span> <i class="fas fa-info-circle" />
                    </v-chip>
                  </template>
                  <span>There is no extractor in the game for this resource: Leaves, Wood, Mycelia, alien remains, power slugs and FICSMAS gifts are all picked up by hand.<br>The planner takes them as supplied, because there is nothing it could ask you to build.</span>
                </v-tooltip>
              </template>
              <template v-if="showUnpackagedChip(factory, partId.toString())">
                <v-tooltip bottom>
                  <template #activator="{ props: activatorProps }">
                    <v-chip v-bind="activatorProps" class="sf-chip cyan small">
                      <i class="fas fa-box-open mr-2" /><span class="mr-2">Unpackaged</span> <i class="fas fa-info-circle" />
                    </v-chip>
                  </template>
                  <span>This fluid is supplied by unpackaging within this factory rather than being drawn from raw resources.</span>
                </v-tooltip>
              </template>
              <div v-if="showSatisfactionItemButton(factory, partId.toString(), 'addToFactory')" class="mt-1">
                <v-tooltip bottom>
                  <template #activator="{ props: activatorProps }">
                    <v-btn
                      v-bind="activatorProps"
                      class="mr-1"
                      color="secondary"
                      :disabled="addingShortagePart === partId.toString()"
                      size="small"
                      variant="outlined"
                      @click="addShortageToNewFactory(factory, partId.toString())"
                    >
                      <template v-if="addingShortagePart === partId.toString()">
                        <v-progress-circular class="mr-1" indeterminate size="14" width="2" />
                        <span>Adding...</span>
                      </template>
                      <template v-else>
                        +&nbsp;<i class="fas fa-industry" /><span class="ml-1">New</span>
                      </template>
                    </v-btn>
                  </template>
                  <span>Adds this shortage as a product of a brand new factory,<br>and imports it into this factory.</span>
                </v-tooltip>
                <v-tooltip bottom>
                  <template #activator="{ props: activatorProps }">
                    <v-btn
                      v-bind="activatorProps"
                      color="secondary"
                      size="small"
                      variant="outlined"
                      @click="openAddShortageDialog(partId.toString())"
                    >
                      +&nbsp;<i class="fas fa-industry" /><span class="ml-1">Existing</span>
                    </v-btn>
                  </template>
                  <span>Adds this shortage as a product of an existing factory of your choice,<br>and imports it into this factory.</span>
                </v-tooltip>
              </div>
            </div>
          </td>
          <td :class="satisfactionShading(part, partId.toString())">
            <p v-if="getPartExportRequests(factory, partId.toString()).length === 0" class="text-center">
              -
            </p>
            <div v-else>
              <div>
                <v-chip
                  v-for="(request) in getPartExportRequests(factory, partId.toString())"
                  :key="`${partId}-${request.requestingFactoryId}`"
                  class="sf-chip sf-chip-clickable small factory"
                  :color="isRequestSelected(factory, request.requestingFactoryId.toString(), partId.toString()) ? 'primary' : ''"
                  :style="isRequestSelected(factory, request.requestingFactoryId.toString(), partId.toString()) ? 'border-color: rgb(0, 123, 255) !important' : ''"
                  @click="initCalculator(factory, partId.toString(), request.requestingFactoryId)"
                >
                  <input
                    v-if="factory.checklistEnabled"
                    :checked="isChecklistExportComplete(factory, request.requestingFactoryId, partId.toString())"
                    class="checklist-tick"
                    :class="{ desynced: isChecklistExportDesynced(factory, request.requestingFactoryId, partId.toString(), request.amount) }"
                    :title="isChecklistExportDesynced(factory, request.requestingFactoryId, partId.toString(), request.amount) ? 'Built amount no longer matches the plan — click to re-confirm' : 'Mark this export as built'"
                    type="checkbox"
                    @change="toggleChecklistExport(factory, request.requestingFactoryId, partId.toString(), request.amount)"
                    @click.stop
                  >
                  <factory-icon-display :icon="findFactory(request.requestingFactoryId).icon" size="20" />
                  <span class="ml-2">
                    <b>{{ findFactory(request.requestingFactoryId).name }}</b>: {{ formatNumber(request.amount) }}/min
                  </span>
                  <v-btn
                    class="chip-jump-btn ml-2"
                    color="primary"
                    icon="fas fa-eye"
                    size="x-small"
                    title="Jump to the import taking this export"
                    variant="flat"
                    @click.stop="navigateToImport(request.requestingFactoryId, partId.toString())"
                  />
                </v-chip>
              </div>
            </div>
          </td>
          <td class="text-right" :class="satisfactionShading(part, partId.toString())" style="width: 40px">
            <v-tooltip
              v-if="openedCalculator !== partId && getPartExportRequests(factory, partId.toString()).length > 0"
              location="top"
            >
              <template #activator="{ props: activatorProps }">
                <!-- Span carries the activator: a disabled button gets no pointer events, so the tooltip never fires. -->
                <span v-bind="activatorProps">
                  <v-btn
                    class="rounded"
                    color="primary"
                    :disabled="!factory.exportCalculator[partId]?.selected"
                    icon="fas fa-calculator"
                    size="small"
                    variant="outlined"
                    @click="initCalculator(factory, partId.toString(), factory.exportCalculator[partId]?.selected)"
                  />
                </span>
              </template>
              <span v-if="factory.exportCalculator[partId]?.selected">Export Calculator</span>
              <span v-else>Please select a factory from the left</span>
            </v-tooltip>
            <v-btn
              v-if="openedCalculator === partId"
              class="rounded"
              color="primary"
              icon="fas fa-arrow-up"
              size="small"
              title="Close Export Calculator"
              variant="outlined"
              @click="closeCalculator()"
            />
          </td>
        </tr>
        <tr
          v-if="openedCalculator === partId && getPartExportRequests(factory, partId.toString()).length > 0"
        >
          <td class="calculator-row bg-grey-darken-3" colspan="5">
            <div class="calculator-tray" :class="{ expanded: calculatorShow }">
              <export-calculator
                :key="partId + factory.exportCalculator[partId].selected"
                :factory="factory"
                :part="partId.toString()"
              />
            </div>
          </td>
        </tr>
      </template>
    </tbody>
  </v-table>
  <add-shortage-dialog
    v-if="shortageDialogPart"
    v-model="shortageDialogOpen"
    :factory="factory"
    :part-id="shortageDialogPart"
  />
</template>

<script setup lang="ts">
  import { computed, inject } from 'vue'
  import { getPartDisplayName } from '@/utils/helpers'
  import {
    Factory, FactoryItem, FactoryPowerChangeType,
    PartMetrics,
  } from '@/interfaces/planner/FactoryInterface'
  import { addProductToFactory, fixProduct, getProduct } from '@/utils/factory-management/products'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { getPartExportRequests } from '@/utils/factory-management/exports'
  import { isChecklistExportComplete, isChecklistExportDesynced, toggleChecklistExport } from '@/utils/factory-management/checklist'
  import { hasNoDemand, isEndProduct, isPotentialBlockage, isUnhandledByproduct } from '@/utils/factory-management/status'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useAppStore } from '@/stores/app-store'
  import {
    addShortageToFactory,
    convertWasteToGeneratorFuel,
    showByProductChip,
    showExportedChip,
    showImportedChip,
    showInternalChip,
    showManuallyGatheredChip,
    showProductChip,
    showRecycledChip,
    showSatisfactionItemButton,
    showUnpackagedChip,
  } from '@/utils/factory-management/satisfaction'
  import { getInput, importRowId } from '@/utils/factory-management/inputs'
  import { addPowerProducerToFactory } from '@/utils/factory-management/power'
  import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
  import eventBus from '@/utils/eventBus'
  import ExportCalculator from '@/components/planner/satisfaction/calculator/ExportCalculator.vue'
  import AddShortageDialog from '@/components/planner/satisfaction/AddShortageDialog.vue'
  import {
    initializeCalculatorFactoryPart,
    initializeCalculatorFactorySettings,
  } from '@/utils/factory-management/exportCalculator'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const findFactory = inject('findFactory') as (factoryId: string | number) => Factory
  const navigateToFactory = inject('navigateToFactory') as (
    id: string | number,
    subsection?: string,
    fallback?: string,
  ) => void

  // The export chips name where a part goes; the jump lands on the import row that asked for it,
  // which is what the user is actually after — the destination factory's card only says "somewhere
  // in here". The Imports section is the fallback for the odd case where the row has no id yet
  // (a half-configured import still being filled in).
  const navigateToImport = (requestingFactoryId: number | string, part: string) => {
    navigateToFactory(
      requestingFactoryId,
      importRowId(requestingFactoryId, props.factory.id, part) ?? undefined,
      `${requestingFactoryId}-imports`
    )
  }

  const appStore = useAppStore()

  const { getDefaultRecipeForPart, getGeneratorFuelRecipeByPart, getGameData } = useGameDataStore()
  const openedCalculator = ref('')
  const shortageDialogPart = ref('')
  const shortageDialogOpen = ref(false)
  const addingShortagePart = ref('')
  const satisfactionBreakdowns = appStore.getSatisfactionBreakdowns()
  const calculatorShow = ref(false)

  const props = defineProps<{
    factory: Factory;
    showSurplusOutputs?: boolean;
  }>()

  const filteredParts = computed(() => {
    if (!props.showSurplusOutputs) return props.factory.parts
    const result: Record<string, PartMetrics> = {}
    for (const [partId, part] of Object.entries(props.factory.parts)) {
      // Surplus: amountRemaining > 0
      // Output: exported to another factory
      // Shortage: amountRemaining < 0
      const hasSurplusOrShortage = part.amountRemaining !== 0
      const isExported = getPartExportRequests(props.factory, partId).length > 0
      if (hasSurplusOrShortage || isExported) {
        result[partId] = part
      }
    }
    return result
  })

  const classes = (part: PartMetrics) => {
    return {
      'text-green': part.satisfied,
      'text-red': !part.satisfied,
    }
  }

  const satisfactionShading = (part: PartMetrics, partId: string) => {
    return {
      'border-green': part.satisfied,
      'border-red': !part.satisfied,
      // A byproduct with nowhere to go is satisfied by the numbers and still stops the line, so
      // it takes the row the same way a shortage does, one tier down.
      'border-amber': isUnhandledByproduct(props.factory, partId),
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

  const addShortageToNewFactory = async (factory: Factory, part: string): Promise<void> => {
    if (addingShortagePart.value) return
    addingShortagePart.value = part

    // Let the browser paint the "Adding..." button state before the synchronous recalculation blocks the thread.
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      const targetFactory = newFactory(`${getPartDisplayName(part)} Factory`)
      appStore.addFactory(targetFactory)

      addShortageToFactory(factory, targetFactory, part, getDefaultRecipeForPart(part), Math.abs(factory.parts[part]?.amountRemaining ?? 0))
      calculateFactories(appStore.getFactories(), getGameData())
      eventBus.emit('toast', { message: `Created "${targetFactory.name}" producing "${getPartDisplayName(part)}"!` })

      // The dialog owns this setting; respect it here too so users can add multiple shortages without being jumped around.
      if (localStorage.getItem('shortageJumpToFactory') !== 'false') {
        // The new factory must be in the DOM before we can scroll to it.
        await nextTick()
        navigateToFactory(targetFactory.id)
      }
    } finally {
      addingShortagePart.value = ''
    }
  }

  const openAddShortageDialog = (part: string): void => {
    shortageDialogPart.value = part
    shortageDialogOpen.value = true
  }

  const addGenerator = (factory: Factory, part: string, amount: number): void => {
    const recipe = getGeneratorFuelRecipeByPart(part)

    if (!recipe) {
      console.error(`Could not find generator fuel recipe for part ${part}`)
      return
    }

    // We need to add the power producer first so the DOM renders it.
    // We need to change the ingredients after the fact because reactivity doesn't work correctly with the byproduct display. It needs a calculation.
    addPowerProducerToFactory(factory, {
      building: 'generatornuclear',
      ingredientAmount: 1,
      recipe: recipe.id,
      updated: FactoryPowerChangeType.Ingredient,
    })

    updateFactory(factory)

    // Get the producer which should be the latest one in the array
    const producer = factory.powerProducers[factory.powerProducers.length - 1]

    producer.fuelAmount = convertWasteToGeneratorFuel(recipe, Math.abs(amount))
    updateFactory(factory)
  }

  const showFuelRodsNeeded = (part: string, amount: number) => {
    const recipe = getGeneratorFuelRecipeByPart(part)

    if (!recipe) {
      console.error(`Could not find generator fuel recipe for part ${part}`)
      return
    }

    return convertWasteToGeneratorFuel(recipe, Math.abs(amount))
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

  const initCalculator = async (
    factory: Factory,
    part: string,
    selectedFactory?: number | string | null
  ) => {
    changeCalculatorSelection(factory, selectedFactory, part)
    openedCalculator.value = part

    // Wait for the next tick to ensure the calculator is rendered before properly opening it
    await nextTick()

    calculatorShow.value = true
  }

  const closeCalculator = async () => {
    const part = openedCalculator.value
    calculatorShow.value = false

    await new Promise(resolve => setTimeout(resolve, 300))

    openedCalculator.value = ''

    // The selection lights up the export chip, so a closed tray must not leave one selected.
    if (part && props.factory.exportCalculator[part]) {
      props.factory.exportCalculator[part].selected = null
    }
  }

  const changeCalculatorSelection = (factory: Factory, requestFacIdRaw: number | string | null | undefined, part: string) => {
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
    // Plans saved before the selection was cleared on close can still carry one; only honour it while the tray is open.
    if (openedCalculator.value !== part) return false
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
    // productOnly: a byproduct has no amount of its own to scale, and fixProduct would write one.
    const product = getProduct(factory, partId, true) as FactoryItem

    if (!product) {
      alert('Could not fix the product due to there not being a product! Please report this to Discord with a share link, quoting the factory in question.')
      console.error(`Could not find product for part ${partId}`)
      return
    }
    fixProduct(product, factory)
    updateFactory(factory)
  }

  const doFixGenerator = (factory: Factory, part: string, amount: number) => {
    const generator = factory.powerProducers.find(producer => producer.recipe === getGeneratorFuelRecipeByPart(part)?.id)
    const recipe = getGeneratorFuelRecipeByPart(part)

    if (!generator) {
      alert('Could not fix the generator due to there not being a generator! Please report this to Discord with a share link, quoting the factory in question.')
      console.error(`Could not find generator for part ${part}`)
      return
    }

    if (!recipe) {
      console.error(`Could not find generator fuel recipe for part ${part}`)
      return
    }

    generator.fuelAmount = convertWasteToGeneratorFuel(recipe, Math.abs(amount))
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
          background: var(--sf-problem-bg) !important;
          border-block: thin solid var(--sf-problem-border) !important;
        }

        // Declared after red so a row that is somehow both reads as the worse of the two.
        &.border-amber:not(.border-red) {
          background: var(--sf-status-warning-bg) !important;
          border-block: thin solid var(--sf-status-warning-border) !important;
        }

        &.name {
          height: 78px !important;
          width: 500px;
        }

        &.calculator-row {
          padding: 0 !important;
          height: 0 !important;
        }

        &.satisfaction {
          width: 300px
        }
      }
    }
  }
}

// Sits inside the export chip, so it has to shed the icon button's circle and
// claw back the chip's right padding to avoid looking bolted on.
.chip-jump-btn {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 4px !important;
  margin-right: -4px;
}

.calculator-tray {
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.25s ease-in;

  &.expanded {
    /* Above any expected content height; scrolls if the user stacks up many belt groups */
    max-height: 800px;
    overflow-y: auto;
  }
}

// Box and tick are drawn in CSS on a native checkbox. Vuetify's selection controls point their
// icons at Font Awesome Regular, which this app doesn't ship: the unticked box renders as
// nothing at all. See PlannerFactoryTasks.vue's .task-tick, which this mirrors.
.checklist-tick {
  appearance: none;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-radius: 3px;
  cursor: pointer;
  display: inline-block;
  height: 18px;
  // Baked in rather than an `mr-2` utility class: this scoped rule's [data-v-xxx] attribute
  // selector outweighs Vuetify's plain `.mr-2` class (its spacing utilities carry no
  // !important in Vuetify 3), so the utility class silently lost and the tick sat flush
  // against the factory icon that follows it.
  margin: 0 8px 0 0;
  position: relative;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  width: 18px;
  vertical-align: middle;

  &:checked {
    background-color: var(--sf-success);
    border-color: var(--sf-success);
  }

  &:checked::after {
    border: solid #fff;
    border-width: 0 2px 2px 0;
    content: '';
    height: 10px;
    left: 4px;
    position: absolute;
    top: 0;
    transform: rotate(45deg);
    width: 5px;
  }

  // Desynced: still checked, but the plan's number for this item moved since it was ticked.
  // Amber rather than red — the tick stays applied, this only flags it may be stale — and the
  // tick mark itself becomes a question mark so it reads at a glance without the row's text.
  &.desynced:checked {
    background-color: var(--sf-status-warning-border);
    border-color: var(--sf-status-warning-border);

    &::after {
      border-width: 0;
      content: '?';
      font-size: 13px;
      font-weight: bold;
      height: 18px;
      left: 0;
      line-height: 18px;
      text-align: center;
      top: 0;
      transform: none;
      width: 18px;
    }
  }
}
</style>
