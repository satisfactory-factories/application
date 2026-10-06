<template>
  <template v-if="!validToDisplay">
    <!-- A mine reaches here too, and "no factories available" blames the rest of the plan for
         something that is simply not applicable to it. -->
    <p v-if="ableToImport(factory) === 'producesRawOnly'" class="text-body-2">
      Imports don't apply here: this factory only produces raw resources, and extracting them takes no ingredients.
    </p>
    <p v-else class="text-body-2">There are no factories available to import the current product selection.</p>
  </template>
  <template v-else>
    <!-- A table, so every column lines up whatever the item and factory are called (#46). Keyed by
         index: every half-configured row reads as "null-null", and duplicate keys make Vue patch
         the wrong row. -->
    <v-table v-if="factory.inputs.length" class="imports-table sub-card border-md rounded mb-2" density="compact">
      <thead>
        <tr>
          <th class="item-col">Item</th>
          <th class="from-col">From</th>
          <th class="qty-col">Qty /min</th>
          <th>Share of supply</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(input, inputIndex) in factory.inputs"
          :id="importRowId(factory.id, input.factoryId, input.outputPart) ?? undefined"
          :key="inputIndex"
          class="status-anchor selectors"
        >
          <td class="item-col">
            <!-- Opens the import dialog, where the filtering lives. -->
            <v-btn
              block
              class="import-item-btn rounded text-none justify-start px-3"
              :class="{ 'text-medium-emphasis': !input.outputPart }"
              height="40"
              title="Change where this import comes from"
              variant="outlined"
              @click="openSourceDialog(inputIndex)"
            >
              <game-asset
                v-if="input.outputPart"
                :key="input.outputPart"
                class="mr-2 flex-shrink-0"
                height="28px"
                :subject="input.outputPart"
                type="item"
                width="28px"
              />
              <span v-if="input.outputPart" class="text-body-1" data-testid="import-item-name">{{ getPartDisplayName(input.outputPart) }}</span>
              <span v-else>Choose what to import</span>
              <v-spacer />
              <i class="fas fa-pen ml-3 text-caption text-medium-emphasis" />
            </v-btn>
          </td>
          <td class="from-col">
            <!-- The same factory chip the Exports column uses, with the checklist tick inside it.
                 Clicking it jumps to the product supplying this import. -->
            <factory-chip
              v-if="input.factoryId && findFactory(input.factoryId)?.id"
              :checked="factory.checklistEnabled ? !!input.completed : undefined"
              :desynced="isInputChecklistDesynced(input)"
              :factory="findFactory(input.factoryId)"
              jump-title="Jump to the product supplying this import"
              :tick-title="checklistTickTitle(inputChecklistDesync(input), 'Mark this import as built')"
              @jump="navigateToSource(input)"
              @open="navigateToSource(input)"
              @toggle="toggleChecklistInput(factory, input)"
            >
              <b>{{ findFactory(input.factoryId).name }}</b><template v-if="sourceVia(input).length"> (via {{ sourceVia(input).join(', ') }})</template>
            </factory-chip>
          </td>
          <td class="qty-col">
            <div class="d-flex align-center">
              <v-number-input
                v-model="input.amount"
                aria-label="Qty /min"
                control-variant="stacked"
                density="compact"
                :disabled="!input.outputPart"
                hide-details
                :name="`${input.factoryId}-${input.outputPart}.amount`"
                variant="outlined"
                @update:model-value="updateFactoriesDebounced(factory, input)"
              />
              <debounce-spinner :active="pendingRecalc === `${input.factoryId}-${input.outputPart}`" />
              <v-btn
                class="rounded ml-2"
                color="red"
                icon="fas fa-trash"
                size="small"
                title="Delete this import"
                variant="outlined"
                @click="deleteInput(inputIndex, factory)"
              />
            </div>
          </td>
          <td>
            <!-- Need and Capacity are the two questions an import row can be sized against: what this
                 factory wants, and what the supplier can actually give. Every button here names which
                 one it answers, because asking a supplier for more than it makes is a valid thing to
                 do deliberately and used to be the only thing Satisfy could do. -->
            <div class="d-flex align-center ga-3">
              <import-supply-bar
                v-if="importShare(inputIndex)"
                class="flex-grow-1"
                :provider-name="providerName(inputIndex)"
                :share="importShare(inputIndex)!"
              />
              <v-btn
                v-show="requirementSatisfied(factory, input.outputPart) && showInputOverflow(factory, input.outputPart)"
                class="rounded"
                color="yellow"
                prepend-icon="fas fa-arrow-down"
                size="small"
                @click="updateInputToSatisfy(inputIndex, factory)"
              >Trim to Need{{ satisfyTargetLabel(inputIndex) }}</v-btn>
              <v-btn
                v-show="input.outputPart && !requirementSatisfied(factory, input.outputPart)"
                class="rounded"
                color="green"
                prepend-icon="fas fa-arrow-up"
                size="small"
                @click="updateInputToSatisfy(inputIndex, factory)"
              >Satisfy to Need{{ satisfyTargetLabel(inputIndex) }}</v-btn>
              <v-tooltip location="top" max-width="360">
                <template #activator="{ props: tooltipProps }">
                  <span v-show="canSatisfyToCapacity(inputIndex)">
                    <v-btn
                      v-bind="tooltipProps"
                      class="rounded"
                      color="green"
                      prepend-icon="fas fa-arrow-to-top"
                      size="small"
                      @click="satisfyInputToCapacity(inputIndex, factory)"
                    >Satisfy to Capacity{{ fixTargetSuffix(importCapacity(inputIndex)) }}</v-btn>
                  </span>
                </template>
                <span>
                  This factory needs more than {{ providerName(inputIndex) }} can supply. Take the
                  {{ formatNumber(importCapacity(inputIndex) ?? 0) }}/min it does have spare, rather
                  than asking for the full amount and having to trim it back afterwards.
                </span>
              </v-tooltip>
              <v-tooltip location="top" max-width="360">
                <template #activator="{ props: tooltipProps }">
                  <span v-show="exceedsCapacity(inputIndex)">
                    <v-btn
                      v-bind="tooltipProps"
                      class="rounded"
                      color="yellow"
                      prepend-icon="fas fa-arrow-to-bottom"
                      size="small"
                      @click="trimInputToCapacity(inputIndex, factory)"
                    >Trim to Capacity{{ fixTargetSuffix(importCapacity(inputIndex)) }}</v-btn>
                  </span>
                </template>
                <span>
                  {{ providerName(inputIndex) }} can only spare
                  {{ formatNumber(importCapacity(inputIndex) ?? 0) }}/min of this item after its own
                  production and its other exports. Trim this import down to that.
                </span>
              </v-tooltip>
              <v-chip v-if="input.amount === 0" class="sf-chip red small">
                <i class="fas fa-exclamation-triangle" />
                <span class="ml-2">No amount set!</span>
              </v-chip>
              <v-chip v-if="isImportRedundant(inputIndex, factory)" class="sf-chip small status-warning-outlined">
                <i class="fas fa-exclamation-triangle" />
                <span class="ml-2">Redundant!</span>
              </v-chip>
            </div>
          </td>
        </tr>
      </tbody>
    </v-table>
    <div class="input-row d-flex align-center">
      <v-btn
        color="green"
        :disabled="ableToImport(factory) !== true"
        prepend-icon="fas fa-dolly"
        ripple
        :variant="ableToImport(factory) === true ? 'flat' : 'outlined'"
        @click="openSourceDialog(null)"
      >Add Import
      </v-btn>
      <span v-if="ableToImport(factory) === 'producesRawOnly'" class="ml-2">(Imports don't apply here: this factory only produces raw resources, and extracting them takes no ingredients.)</span>
      <span v-if="ableToImport(factory) === 'noImportFacs'" class="ml-2">(There are no factories that have exports available to supply this factory.)</span>
    </div>
  </template>

  <import-source-dialog
    v-model="sourceDialogOpen"
    :factory="factory"
    :input-index="sourceDialogIndex"
    @select="applySource"
  />
</template>

<script setup lang="ts">
  import {
    addInputToFactory,
    calculateAbleToImport,
    calculateImportCandidates,
    calculateImportCapacity,
    calculateImportShare,
    calculatePossibleImports,
    canSatisfyImportToCapacity,
    deleteInputPair,
    importExceedsCapacity,
    importRowId,
    ImportShare,
    isDuplicateImport,
    isImportRedundant,
    satisfyImport,
    satisfyImportTarget,
    satisfyImportToCapacity,
    trimImportToCapacity,
    validateInput,
  } from '@/utils/factory-management/inputs'
  import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'
  import { getPartDisplayName } from '@/utils/helpers'
  import { fixTargetSuffix, formatNumber } from '@/utils/numberFormatter'
  import { useAppStore } from '@/stores/app-store'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { getExportableFactories } from '@/utils/factory-management/exports'
  import {
    getImportableParts,
    getRedistributionSourceNames,
    isPartRedistributed,
  } from '@/utils/factory-management/redistribution'
  import ImportSourceDialog from '@/components/planner/imports/ImportSourceDialog.vue'
  import ImportSupplyBar from '@/components/planner/imports/ImportSupplyBar.vue'
  import {
    checklistTickTitle,
    inputChecklistDesync,
    isInputChecklistDesynced,
    toggleChecklistInput,
  } from '@/utils/factory-management/checklist'
  import { productRowId } from '@/utils/factory-management/products'
  import { useDebouncedAction } from '@/composables/useDebouncedAction'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const { getFactories } = useAppStore()
  // Qty edits mutate the input instantly; only the recalculation is debounced.
  const { debouncing: pendingRecalc, runDebounced } = useDebouncedAction()
  const { getGameData } = useGameDataStore()

  const findFactory = inject('findFactory') as (id: string | number) => Factory
  const updateFactory = inject('updateFactory') as (factory: Factory, mode?: string) => void
  const navigateToFactory = inject('navigateToFactory') as (
    id: number | null,
    subsection?: string | string[],
    fallback?: string,
  ) => void

  // The mirror of the export chips' jump: land on the product supplying this import rather than on
  // the supplying factory's card, which only says "somewhere in here". A part supplied as a
  // byproduct has no row of its own, and its marker sends the flash to the product that makes it.
  // The Products section is the fallback for the rest — a factory can export a surplus of
  // something it imports, which it produces nowhere.
  const navigateToSource = (input: FactoryInput) => {
    if (!input.factoryId) return

    navigateToFactory(
      input.factoryId,
      input.outputPart ? productRowId(input.factoryId, input.outputPart) : undefined,
      `${input.factoryId}-products`
    )
  }

  const props = defineProps<{
    factory: Factory;
  }>()

  const validToDisplay = computed(() => {
    if (possibleImports.value.length > 0) {
      return true
    }

    if (props.factory.inputs.length > 0) {
      return true
    }

    // Nothing this factory needs is on offer, but something else is: it can still become a hub.
    return surplusAvailable.value
  })

  // Check if another factory has exports that can be used as imports for the current factory
  const possibleImports = computed(() => {
    return calculatePossibleImports(props.factory, factoriesWithExports.value)
  })

  const factoriesWithExports = computed(() => {
    return getExportableFactories(getFactories())
  })

  // Whether any other factory has anything spare at all, needed here or not (#46).
  const surplusAvailable = computed(() =>
    getImportableParts(props.factory, getFactories(), true).length > 0
  )

  const deleteInput = (inputIndex: number, factory: Factory) => {
    const input = factory.inputs[inputIndex]
    deleteInputPair(factory, input, getFactories(), getGameData())
  }

  const ableToImport = (factory: Factory): string | boolean => {
    const result = calculateAbleToImport(factory, importCandidates.value)

    // A factory that needs nothing (or has nothing it needs on offer) can still import a surplus
    // to pass on. A mine stays blocked: it is the thing being imported from.
    if ((result === 'noProductsOrProducers' || result === 'noImportFacs') && surplusAvailable.value) {
      return true
    }

    return result
  }

  // The import dialog. A null index adds a new row once a source is picked, so there is never a
  // half-filled row sitting on the factory.
  const sourceDialogOpen = ref(false)
  const sourceDialogIndex = ref<number | null>(null)

  const openSourceDialog = (inputIndex: number | null) => {
    sourceDialogIndex.value = inputIndex
    sourceDialogOpen.value = true
  }

  const applySource = ({ factoryId, part, spare }: { factoryId: number, part: string, spare: number }) => {
    const factory = props.factory
    let inputIndex = sourceDialogIndex.value

    if (inputIndex === null) {
      addInputToFactory(factory, { factoryId, outputPart: part, amount: 0 })
      inputIndex = factory.inputs.length - 1
    } else {
      const input = factory.inputs[inputIndex]
      const changed = input.factoryId !== factoryId || input.outputPart !== part
      if (!changed) return
      input.factoryId = factoryId
      input.outputPart = part
    }

    const input = factory.inputs[inputIndex]
    if (!input.amount) {
      // Size a new row to what this factory needs; a hub needs nothing, so it takes what is spare.
      const need = factory.parts[part] ? satisfyImportTarget(inputIndex, factory) : null
      input.amount = need && need > 0 ? need : (spare > 0 ? spare : 1)
    }

    markFactoryEdited(factory)
    handleInputFactoryChange(factory, inputIndex)
    updateFactories(factory, input)
  }

  // Where a hub's stock of the row's item comes from, for "from Hub (via Iron Factory)".
  const sourceVia = (input: FactoryInput): string[] => {
    if (!input.factoryId || !input.outputPart) return []
    const provider = findFactory(input.factoryId)
    if (!provider?.id || !isPartRedistributed(provider, input.outputPart)) return []
    return getRedistributionSourceNames(provider, input.outputPart, getFactories())
  }

  const handleInputFactoryChange = (factory: Factory, inputIndex: number) => {
    // The part selector filters out combinations already in use, but switching the factory
    // can land on one. Clear the part and let the user pick again.
    if (isDuplicateImport(factory, inputIndex)) {
      factory.inputs[inputIndex].outputPart = null
    }

    // Initiate a factory update for all factories involved
    updateFactory(factory) // This factory

    // Grab a difference between the current input state and the old one
    const oldInputs = factory.previousInputs
    const newInputs = factory.inputs

    // Find the difference
    const diff = oldInputs.filter((input, index) => {
      return JSON.stringify(input) !== JSON.stringify(newInputs[index])
    })

    // For the difference, tell the factories to update
    diff.forEach(input => {
      if (input.factoryId) {
        updateFactory(findFactory(input.factoryId))
      }
    })

    // Update the state
    factory.previousInputs = JSON.parse(JSON.stringify(factory.inputs))
  }

  const requirementSatisfied = (factory: Factory, part: string | null): boolean => {
    if (!part) {
      console.warn('requirementSatisfied: No part provided for input satisfaction check. It could be the user has not properly selected an output part yet.')
      return false
    }
    const requirement = factory.parts[part]

    if (!requirement) {
      console.warn(`handleFactoryChange: Could not find part requirement in factory ${factory.name} for input satisfaction check. Part: ${part}`)
      return false
    }

    return requirement.amountRemaining >= 0
  }

  const showInputOverflow = (factory: Factory, part: string | null): boolean => {
    if (!part) {
      console.error('showInputOverflow: No part provided for input overflow check.')
      return false
    }
    const requirement = factory.parts[part]

    return requirement.amountRemaining > 0
  }

  const updateInputToSatisfy = (inputIndex: number, factory: Factory) => {
    satisfyImport(inputIndex, factory)
    updateFactories(factory, factory.inputs[inputIndex])
  }

  // The provider a row points at, or null while the row is still half-filled. findFac hands back
  // an empty object rather than throwing when the id is unknown, so the id is what gets tested.
  const providerFor = (inputIndex: number): Factory | null => {
    const input = props.factory.inputs[inputIndex]
    if (!input?.factoryId || !input.outputPart) {
      return null
    }
    const provider = findFactory(input.factoryId)
    return provider?.id ? provider : null
  }

  // What Satisfy/Trim would set the Qty to, appended to the button so the figure is visible
  // before the press rather than only after it.
  const satisfyTargetLabel = (inputIndex: number): string =>
    fixTargetSuffix(satisfyImportTarget(inputIndex, props.factory))

  const providerName = (inputIndex: number): string => providerFor(inputIndex)?.name ?? 'This factory'

  const importCapacity = (inputIndex: number): number | null => {
    const provider = providerFor(inputIndex)
    return provider ? calculateImportCapacity(inputIndex, props.factory, provider) : null
  }

  const importShare = (inputIndex: number): ImportShare | null => {
    const provider = providerFor(inputIndex)
    return provider ? calculateImportShare(inputIndex, props.factory, provider) : null
  }

  const exceedsCapacity = (inputIndex: number): boolean => {
    const provider = providerFor(inputIndex)
    return provider ? importExceedsCapacity(inputIndex, props.factory, provider) : false
  }

  const canSatisfyToCapacity = (inputIndex: number): boolean => {
    const provider = providerFor(inputIndex)
    return provider ? canSatisfyImportToCapacity(inputIndex, props.factory, provider) : false
  }

  const satisfyInputToCapacity = (inputIndex: number, factory: Factory) => {
    const provider = providerFor(inputIndex)
    if (!provider) {
      return
    }
    satisfyImportToCapacity(inputIndex, factory, provider)
    updateFactories(factory, factory.inputs[inputIndex])
  }

  const trimInputToCapacity = (inputIndex: number, factory: Factory) => {
    const provider = providerFor(inputIndex)
    if (!provider) {
      return
    }
    trimImportToCapacity(inputIndex, factory, provider)
    updateFactories(factory, factory.inputs[inputIndex])
  }

  const importCandidates = computed((): Factory[] => {
    return calculateImportCandidates(props.factory, possibleImports.value)
  })

  // Debounced variant for the Qty input, which fires per keystroke. validateInput also
  // waits — it clamps 0 to 1 with a toast, which would fight the user mid-typing.
  const updateFactoriesDebounced = (factory: Factory, input: FactoryInput) => {
    runDebounced(`${input.factoryId}-${input.outputPart}`, () => {
      validateInput(input)
      updateFactory(factory)
      if (input.factoryId) {
        updateFactory(findFactory(input.factoryId))
      }
    })
  }

  const updateFactories = (factory: Factory, input: FactoryInput) => {
    validateInput(input)
    updateFactory(factory)
    if (input.factoryId) {
      updateFactory(findFactory(input.factoryId))
    }
  }
</script>

<style lang="scss" scoped>
  .input-row {
    max-width: 100%;
  }

  .imports-table {
    overflow-x: auto;

    th {
      white-space: nowrap;
    }

    td {
      padding-bottom: 8px !important;
      padding-top: 8px !important;
    }

    // Item, From and Qty shrink to their widest row and never truncate, so every row lines up and
    // nothing is cut off; the supply bar takes whatever width is left.
    .item-col,
    .from-col,
    .qty-col {
      white-space: nowrap;
      width: 1%;
    }

    // Wide enough for the longest item name in the game, Electromagnetic Control Rod, so the column
    // does not shift from factory to factory.
    .import-item-btn {
      min-width: 310px;

      :deep(.v-btn__content) {
        width: 100%;
      }
    }

    // The number input has no width of its own to shrink to, so it is given one.
    .qty-col :deep(.v-number-input) {
      flex: 0 0 auto;
      width: 130px;
    }

    // The item button and the factory chip are the same height, and every chip fills the column,
    // so the From column reads as one block as wide as its longest factory name.
    .from-col :deep(.v-chip) {
      font-size: 0.95rem;
      height: 40px;
      width: 100%;
    }
  }
</style>
