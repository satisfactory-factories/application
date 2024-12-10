<template>
  <div>
    <h1 class="text-h5 mb-4">
      <i class="fas fa-arrow-to-right" />
      <span class="ml-3">Imports</span>
    </h1>
    <p v-show="helpText" class="text-body-2 mb-4">
      <i class="fas fa-info-circle" /> Imports are the resources needed to produce the factory's products and ensure its satisfaction. To set up imports, you select another factory and choose one of its outputs. This creates a "request" for that output. The selected factory must fulfill this request, and you'll be notified if it cannot meet the demand. All available outputs are listed in the Outputs section of the factory you choose.
    </p>
    <div v-if="Object.keys(factory.rawResources).length > 0 || Object.keys(factory.parts).length > 0">
      <v-card v-if="Object.keys(factory.rawResources).length > 0" class="mb-4 border-md sub-card">
        <v-card-title>
          <i class="fas fa-hard-hat" /><span class="ml-2">Raw Resources</span>
        </v-card-title>
        <v-card-text class="text-body-2">
          <p class="mb-4">
            <i class="fas fa-info-circle" /> Raw resources (e.g. Iron Ore) aren't defined as imports. It is assumed you'll supply them sufficiently. It seemed a little pointless to force you to make a factory to input it directly into a factory.
          </p>
          <v-chip
            v-for="(resource, resourceKey) in factory.rawResources"
            :key="resourceKey"
            class="sf-chip blue"
          >
            <game-asset :subject="resourceKey.toString() ?? 'unknown'" type="item" />
            <span class="ml-2">
              <b>{{ getPartDisplayName(resourceKey.toString()) }}</b>: {{ formatNumber(resource.amount) }}/min
            </span>
          </v-chip>
        </v-card-text>
      </v-card>

      <v-card class="rounded sub-card border-md mb-2">
        <div
          v-for="(input, inputIndex) in factory.inputs"
          :key="`${inputIndex}-${input.outputPart}`"
          class="selectors d-flex flex-column flex-md-row ga-3 px-4 pb-2 my-2 border-b-md no-bottom"
        >
          <div class="input-row d-flex align-center">
            <i class="fas fa-industry mr-2" style="width: 32px; height: 32px;" />
            <!-- This is being watched for changes to update the old factory -->
            <v-autocomplete
              v-model.number="input.factoryId"
              hide-details
              :items="getImportFactorySelections(inputIndex)"
              label="Factory"
              max-width="300px"
              variant="outlined"
              width="300px"
              @update:model-value="handleInputFactoryChange(factory)"
            />
          </div>
          <div class="input-row d-flex align-center">
            <span v-show="!input.outputPart" class="mr-2">
              <i class="fas fa-cube" style="width: 32px; height: 32px" />
            </span>
            <span v-if="input.outputPart" class="mr-2">
              <game-asset
                :key="input.outputPart"
                height="32px"
                :subject="input.outputPart"
                type="item"
                width="32px"
              />
            </span>
            <v-autocomplete
              v-model="input.outputPart"
              :disabled="!input.factoryId"
              hide-details
              :items="getImportPartSelections(inputIndex)"
              label="Item"
              max-width="350px"
              variant="outlined"
              width="350px"
              @update:model-value="updateFactories(factory, input)"
            />
          </div>
          <div class="input-row d-flex align-center">
            <v-text-field
              v-model.number="input.amount"
              :disabled="!input.outputPart"
              hide-details
              label="Qty /min"
              :max-width="smAndDown ? undefined : '110px'"
              :min-width="smAndDown ? undefined : '100px'"
              type="number"
              variant="outlined"
              @input="updateFactories(factory, input)"
            />
          </div>
          <div class="input-row d-flex align-center">
            <v-btn
              v-show="requirementSatisfied(factory, input.outputPart) && showInputOverflow(factory, input.outputPart)"
              class="rounded mr-2"
              color="yellow"
              prepend-icon="fas fa-arrow-down"
              size="default"
              @click="updateInputToSatisfy(factory, input)"
            >Trim</v-btn>
            <v-btn
              v-show="input.outputPart && !requirementSatisfied(factory, input.outputPart)"
              class="rounded mr-2"
              color="green"
              prepend-icon="fas fa-arrow-up"
              size="default"
              @click="updateInputToSatisfy(factory, input)"
            >Satisfy</v-btn>
            <v-btn
              class="rounded"
              color="primary"
              :disabled="!input.factoryId"
              prepend-icon="fas fa-industry"
              size="default"
              variant="outlined"
              @click="navigateToFactory(input.factoryId)"
            >View</v-btn>
            <v-btn
              class="rounded ml-2"
              color="red"
              icon="fas fa-trash"
              size="small"
              variant="outlined"
              @click="deleteInput(inputIndex, factory)"
            />
          </div>
          <div class="input-row d-flex align-center">
            <v-chip v-if="input.amount === 0" class="sf-chip red small">
              <i class="fas fa-exclamation-triangle" />
              <span class="ml-2">No amount set!</span>
            </v-chip>
          </div>
        </div></v-card>
      <div class="input-row d-flex align-center">
        <v-btn
          v-show="Object.keys(factory.parts).length > 0"
          color="green"
          :disabled="ableToImport(factory) !== true"
          prepend-icon="fas fa-dolly"
          ripple
          :variant="ableToImport(factory) === true ? 'flat' : 'outlined'"
          @click="addEmptyInput(factory)"
        >Add Import
        </v-btn>
        <span v-if="ableToImport(factory) === 'noProducts'" class="ml-2">(This factory does not yet have any products.)</span>
        <span v-if="ableToImport(factory) === 'rawOnly'" class="ml-2">(This factory is only using raw resources and requires no imports.)</span>
        <span v-if="ableToImport(factory) === 'noImportFacs'" class="ml-2">(There are no factories that have exports available to supply this factory.)</span>
      </div>
    </div>
    <p v-else class="text-body-1">Awaiting product selection.</p>
  </div>
</template>

<script setup lang="ts">
  import { defineProps } from 'vue'
  import { Factory, FactoryInput, PartMetrics } from '@/interfaces/planner/FactoryInterface'
  import {
    addInputToFactory,
    calculateAbleToImport,
    calculateImportCandidates,
    calculatePossibleImports,
    importFactorySelections,
    importPartSelections,
  } from '@/utils/factory-management/inputs'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useDisplay } from 'vuetify'
  import { calculateDependencies, scanForInvalidInputs } from '@/utils/factory-management/dependencies'
  import { useAppStore } from '@/stores/app-store'
  import { getExportableFactories } from '@/utils/factory-management/exports'

  const { getFactories } = useAppStore()

  const findFactory = inject('findFactory') as (id: string | number) => Factory
  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const navigateToFactory = inject('navigateToFactory') as (id: number | null) => void

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const { smAndDown } = useDisplay()

  const addEmptyInput = (factory: Factory) => {
    addInputToFactory(factory, {
      factoryId: null,
      outputPart: null,
      amount: 0,
    })
  }

  const deleteInput = (inputIndex: number, factory: Factory) => {
    // Take a copy of the current input data without copying via reference
    const input: FactoryInput = JSON.parse(JSON.stringify(factory.inputs[inputIndex]))

    factory.inputs.splice(inputIndex, 1)
    calculateDependencies(getFactories())
    scanForInvalidInputs(getFactories())
    updateFactory(factory)

    // Also update the other factory affected
    if (input.factoryId) {
      updateFactory(findFactory(input.factoryId))
    }
  }

  const factoriesWithExports = computed(() => {
    return getExportableFactories(getFactories())
  })

  // Check if another factory has exports that can be used as imports for the current factory
  const possibleImports = computed(() => {
    return calculatePossibleImports(props.factory, factoriesWithExports.value)
  })

  const importCandidates = computed((): Factory[] => {
    return calculateImportCandidates(props.factory, possibleImports.value)
  })

  const getImportFactorySelections = (inputIndex: number) => {
    return importFactorySelections(
      inputIndex,
      importCandidates.value,
      props.factory,
      getFactories(),
    )
  }

  const getImportPartSelections = (inputIndex: number): { title: string, value: string}[] => {
    // Get selected factory from input
    const input = props.factory.inputs[inputIndex]
    if (!input.factoryId) {
      return [] // They're still choosing one, and the selector is disabled.
    }
    const parts = importPartSelections(
      findFactory(input.factoryId),
      props.factory,
      inputIndex
    )

    // Since we don't want to include the gameDataStore in the inputs.ts file, we need to hydrate the part names now
    return parts.map(part => {
      return {
        title: getPartDisplayName(part),
        value: part,
      }
    })
  }

  const ableToImport = (factory: Factory): string | boolean => {
    return calculateAbleToImport(factory, importCandidates.value)
  }

  // Gets the products of another factory for dependencies

  const handleInputFactoryChange = (factory: Factory) => {
    syncDependencyTree()

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

  const updateInputToSatisfy = (factory: Factory, input: FactoryInput) => {
    if (!input.outputPart) {
      console.error('updateInputToSatisfy: No output part selected for input:', input)
      return
    }
    const part: PartMetrics = factory.parts[input.outputPart]
    input.amount = part.amountRequired

    syncDependencyTree()
    updateFactory(factory)
    // Also update the factory that was selected
    if (input.factoryId) {
      updateFactory(findFactory(input.factoryId))
    }
  }

  const updateFactories = (factory: Factory, input: FactoryInput) => {
    syncDependencyTree()
    // Update this factory
    updateFactory(factory)

    if (input.factoryId) {
      // Update the other factory
      updateFactory(findFactory(input.factoryId))
    }
  }

  const syncDependencyTree = () => {
    console.log('syncing dependency tree')
    calculateDependencies(getFactories())
    scanForInvalidInputs(getFactories())
  }

</script>

<style lang="scss" scoped>
  .input-row {
    max-width: 100%;
  }

  .selectors {
    &:last-of-type {
      border-bottom: none !important;
    }
  }
</style>
