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
    <v-card class="rounded sub-card border-md mb-2">
      <!-- Keyed by index: every half-configured row reads as "null-null", and duplicate
           keys make Vue patch the wrong row's selectors.

           The space around a row is its own padding, not a margin: a margin belongs to nothing,
           so the gap above the first row and the gaps between rows sat outside every row's box
           and outside the jump highlight, which then read as a band floating between the
           separators rather than the row itself. Same pixels either way — the 8px above a row
           used to be its margin collapsing with the one below the row before it. -->
      <div
        v-for="(input, inputIndex) in factory.inputs"
        :id="importRowId(factory.id, input.factoryId, input.outputPart) ?? undefined"
        :key="inputIndex"
        class="status-anchor selectors d-flex flex-column flex-md-row ga-3 px-4 py-2 border-b-md no-bottom"
      >
        <div v-if="factory.checklistEnabled" class="input-row d-flex align-center">
          <!-- Keyed on the checked value itself (mirrors PlannerFactoryChecklist.vue and
               PlannerFactorySatisfactionItems.vue's export tick, #592/#593): a `preventDefault()`-
               cancelled checkbox click can lose a race against the browser's own revert-to-pre-
               click step, leaving the tick visually stuck even though the underlying state did
               flip. Keying on the value forces Vue to mount a fresh element at the new value
               instead of patching the (possibly just-reverted) old one. -->
          <input
            :key="`${input.factoryId}-${input.outputPart}-${!!input.completed}`"
            :checked="!!input.completed"
            class="checklist-tick"
            :class="{ desynced: isInputChecklistDesynced(input) }"
            :title="checklistTickTitle(inputChecklistDesync(input), 'Mark this import as built')"
            type="checkbox"
            @click.prevent="toggleChecklistInput(factory, input)"
          >
        </div>
        <!-- The item comes first, as it did with the old pickers, and the factory supplying it sits
             beside it in a chip rather than as a second icon, which read as a second import. The item
             button opens the import dialog, where the filtering lives (#46). -->
        <div class="input-row d-flex align-center ga-2">
          <v-btn
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
              class="mr-2"
              height="28px"
              :subject="input.outputPart"
              type="item"
              width="28px"
            />
            <span v-if="input.outputPart" class="text-body-1 text-truncate" data-testid="import-item-name">{{ getPartDisplayName(input.outputPart) }}</span>
            <span v-else>Choose what to import</span>
            <i class="fas fa-pen ml-3 text-caption text-medium-emphasis" />
          </v-btn>
          <v-chip
            v-if="input.factoryId"
            class="sf-chip import-source import-factory-chip"
            :title="sourceVia(input).length ? `Redistributed by ${findFactory(input.factoryId)?.name} from ${sourceVia(input).join(', ')}` : undefined"
          >
            <factory-icon-display class="mr-2" :icon="findFactory(input.factoryId)?.icon" size="18" />
            <span class="text-truncate">{{ findFactory(input.factoryId)?.name }}<template v-if="sourceVia(input).length"> (via {{ sourceVia(input).join(', ') }})</template></span>
          </v-chip>
        </div>
        <div class="input-row d-flex align-center">
          <v-number-input
            v-model="input.amount"
            control-variant="stacked"
            density="compact"
            :disabled="!input.outputPart"
            hide-details
            label="Qty /min"
            :max-width="smAndDown ? undefined : '130px'"
            :min-width="smAndDown ? undefined : '130px'"
            :name="`${input.factoryId}-${input.outputPart}.amount`"
            variant="outlined"
            @update:model-value="updateFactoriesDebounced(factory, input)"
          />
          <debounce-spinner :active="pendingRecalc === `${input.factoryId}-${input.outputPart}`" />
        </div>
        <!-- Wraps rather than overflowing: a row can carry a Need button and a Capacity button at
             once, and the pair plus View and delete is wider than the card on any screen. -->
        <div class="input-row d-flex align-center flex-wrap ga-2">
          <!-- Need and Capacity are the two questions an import row can be sized against: what this
               factory wants, and what the supplier can actually give. Every button here names which
               one it answers, because asking a supplier for more than it makes is a valid thing to
               do deliberately and used to be the only thing Satisfy could do. -->
          <v-btn
            v-show="requirementSatisfied(factory, input.outputPart) && showInputOverflow(factory, input.outputPart)"
            class="rounded"
            color="yellow"
            prepend-icon="fas fa-arrow-down"
            size="default"
            @click="updateInputToSatisfy(inputIndex, factory)"
          >Trim to Need{{ satisfyTargetLabel(inputIndex) }}</v-btn>
          <v-btn
            v-show="input.outputPart && !requirementSatisfied(factory, input.outputPart)"
            class="rounded"
            color="green"
            prepend-icon="fas fa-arrow-up"
            size="default"
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
                  size="default"
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
                  size="default"
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
          <v-btn
            class="rounded"
            color="primary"
            :disabled="!input.factoryId"
            prepend-icon="fas fa-industry"
            size="default"
            title="Jump to the product supplying this import"
            variant="outlined"
            @click="navigateToSource(input)"
          >View</v-btn>
          <v-btn
            class="rounded"
            color="red"
            icon="fas fa-trash"
            size="small"
            variant="outlined"
            @click="deleteInput(inputIndex, factory)"
          />
        </div>
        <div class="input-row d-flex align-center flex-wrap ga-2">
          <v-tooltip location="top" max-width="360">
            <template #activator="{ props: tooltipProps }">
              <span class="d-inline-flex flex-shrink-0" v-bind="tooltipProps">
                <v-switch
                  v-model="input.redistribute"
                  class="redistribute-switch"
                  color="blue"
                  density="compact"
                  :disabled="!input.outputPart || !canRedistribute(input)"
                  hide-details
                  @update:model-value="toggleRedistribute(factory, input)"
                >
                  <!-- On, the label becomes the row's "Redistributed" marker, so the row does not
                       carry a switch and a chip saying the same thing side by side. -->
                  <template #label>
                    <span v-if="input.redistribute" class="text-blue">
                      <i class="fas fa-random mr-1" />Redistributed
                    </span>
                    <span v-else>Redistribute</span>
                  </template>
                </v-switch>
              </span>
            </template>
            <span v-if="input.outputPart && !canRedistribute(input)">
              {{ findFactory(input.factoryId as number)?.name }} already gets its
              {{ getPartDisplayName(input.outputPart) }} from this factory, so passing it back on
              would make a loop.
            </span>
            <span v-else>
              Make this import available for other factories to import from here, turning this
              factory into a distribution hub for it.
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
      </div>
    </v-card>
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
    calculatePossibleImports,
    canSatisfyImportToCapacity,
    deleteInputPair,
    importExceedsCapacity,
    importRowId,
    isDuplicateImport,
    isImportRedundant,
    satisfyImport,
    satisfyImportTarget,
    satisfyImportToCapacity,
    trimImportToCapacity,
    validateInput,
  } from '@/utils/factory-management/inputs'
  import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'
  import { useDisplay } from 'vuetify'
  import { getPartDisplayName } from '@/utils/helpers'
  import { fixTargetSuffix, formatNumber } from '@/utils/numberFormatter'
  import { useAppStore } from '@/stores/app-store'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { getExportableFactories, getPartExportRequests } from '@/utils/factory-management/exports'
  import {
    canRedistributeInput,
    getImportableParts,
    getRedistributionSourceNames,
    isPartRedistributed,
  } from '@/utils/factory-management/redistribution'
  import { calculateFactories } from '@/utils/factory-management/factory'
  import ImportSourceDialog from '@/components/planner/imports/ImportSourceDialog.vue'
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
  const { smAndDown } = useDisplay()

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
    // to redistribute. A mine stays blocked: it is the thing being imported from.
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
      // Re-pointing a row at a different item changes what it is for, so a hub flag set for the
      // old item does not carry over.
      if (input.outputPart !== part) {
        delete input.redistribute
      }
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

  const canRedistribute = (input: FactoryInput): boolean =>
    canRedistributeInput(props.factory, input, getFactories())

  const toggleRedistribute = (factory: Factory, input: FactoryInput) => {
    if (!input.redistribute) {
      delete input.redistribute

      // Turning it off takes the part off the hub's export list, and the imports other factories
      // take from it go with it on the next recalculation. Say so before that happens.
      const part = input.outputPart as string
      const consumers = getPartExportRequests(factory, part).length
      if (consumers > 0 && !isPartRedistributed(factory, part) && !factory.parts[part]?.amountSuppliedViaProduction) {
        if (!confirm(`${consumers} factor${consumers === 1 ? 'y imports' : 'ies import'} this item from here. Stopping redistribution will remove ${consumers === 1 ? 'that import' : 'those imports'}. Continue?`)) {
          input.redistribute = true
          return
        }
      }
    }

    markFactoryEdited(factory)

    // Switching it on only changes this factory; switching it off can strip other factories'
    // imports from here, which only a full pass reconciles.
    if (input.redistribute) {
      updateFactory(factory)
    } else {
      calculateFactories(getFactories(), getGameData())
    }
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

  .import-item-btn {
    max-width: 280px;
    min-width: 200px;
  }

  .import-factory-chip {
    max-width: 320px;
  }

  .redistribute-switch {
    flex: 0 0 auto;
    width: auto;

    :deep(.v-selection-control) {
      min-height: 40px;
    }

    :deep(.v-label) {
      opacity: 1;
      padding-right: 4px;
      white-space: nowrap;
    }
  }

  .selectors {
    &:last-of-type {
      border-bottom: none !important;
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
    display: block;
    height: 18px;
    margin: 0;
    position: relative;
    transition: background-color 0.15s ease, border-color 0.15s ease;
    width: 18px;

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
    // Amber rather than red — the tick stays applied, this only flags it may be stale. Plain, with
    // no glyph of its own: the row's adjoining "Desynced" chip already carries that meaning, and a
    // second symbol crammed into an 18px box read worse than the empty box does.
    &.desynced:checked {
      background-color: var(--sf-status-warning-border);
      border-color: var(--sf-status-warning-border);

      &::after {
        content: none;
      }
    }
  }
</style>
