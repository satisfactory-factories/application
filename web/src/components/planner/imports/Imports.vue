<template>
  <template v-if="!validToDisplay">
    <p class="text-body-2">There are no factories available to import the current product selection.</p>
  </template>
  <template v-else>
    <v-card class="rounded sub-card border-md mb-2">
      <div
        v-for="(input, inputIndex) in factory.inputs"
        :key="`${input.factoryId}-${input.outputPart}`"
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
          <v-number-input
            v-model.number="input.amount"
            control-variant="stacked"
            :disabled="!input.outputPart"
            hide-details
            label="Qty /min"
            :max-width="smAndDown ? undefined : '130px'"
            :min-width="smAndDown ? undefined : '130px'"
            :name="`${input.factoryId}-${input.outputPart}.amount`"
            variant="outlined"
            @update:model-value="updateFactories(factory, input)"
          />
        </div>
        <div class="input-row d-flex align-center">
          <v-btn
            v-show="requirementSatisfied(factory, input.outputPart) && showInputOverflow(factory, input.outputPart)"
            class="rounded mr-2"
            color="yellow"
            prepend-icon="fas fa-arrow-down"
            size="default"
            @click="updateInputToSatisfy(inputIndex, factory)"
          >Trim</v-btn>
          <v-btn
            v-show="input.outputPart && !requirementSatisfied(factory, input.outputPart)"
            class="rounded mr-2"
            color="green"
            prepend-icon="fas fa-arrow-up"
            size="default"
            @click="updateInputToSatisfy(inputIndex, factory)"
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
          <v-chip v-if="isImportRedundant(inputIndex, factory)" class="sf-chip small orange">
            <i class="fas fa-exclamation-triangle" />
            <span class="ml-2">Redundant!</span>
          </v-chip>
        </div>
      </div>
    </v-card>
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
      <span v-if="ableToImport(factory) === 'rawOnly'" class="ml-2">(This factory is only using raw resources and requires no imports.)</span>
      <span v-if="ableToImport(factory) === 'noImportFacs'" class="ml-2">(There are no factories that have exports available to supply this factory.)</span>
    </div>
  </template>

</template>

<script setup lang="ts">
  import {
    addInputToFactory,
    calculateAbleToImport,
    calculateImportCandidates,
    calculatePossibleImports,
    deleteInputPair,
    importFactorySelections,
    importPartSelections,
    isImportRedundant,
    satisfyImport,
    validateInput,
  } from '@/utils/factory-management/inputs'
  import { defineProps } from 'vue'
  import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'
  import { useDisplay } from 'vuetify'
  import { getPartDisplayName } from '@/utils/helpers'
  import { useAppStore } from '@/stores/app-store'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { getExportableFactories } from '@/utils/factory-management/exports'

  const { getFactories } = useAppStore()
  const { getGameData } = useGameDataStore()
  const { smAndDown } = useDisplay()

  const findFactory = inject('findFactory') as (id: string | number) => Factory
  const updateFactory = inject('updateFactory') as (factory: Factory, mode?: string) => void
  const navigateToFactory = inject('navigateToFactory') as (id: number | null) => void

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const validToDisplay = computed(() => {
    if (possibleImports.value.length > 0) {
      return true
    }

    if (props.factory.inputs.length > 0) {
      return true
    }

    return false
  })

  // Check if another factory has exports that can be used as imports for the current factory
  const possibleImports = computed(() => {
    return calculatePossibleImports(props.factory, factoriesWithExports.value)
  })

  const factoriesWithExports = computed(() => {
    return getExportableFactories(getFactories())
  })

  const addEmptyInput = (factory: Factory) => {
    addInputToFactory(factory, {
      factoryId: null,
      outputPart: null,
      amount: 0,
    })
  }

  const deleteInput = (inputIndex: number, factory: Factory) => {
    const input = factory.inputs[inputIndex]
    deleteInputPair(factory, input, getFactories(), getGameData())
  }

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

  const handleInputFactoryChange = (factory: Factory) => {
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

  const importCandidates = computed((): Factory[] => {
    return calculateImportCandidates(props.factory, possibleImports.value)
  })

  const updateFactories = (factory: Factory, input: FactoryInput) => {
    validateInput(input)
    updateFactory(factory)
    if (input.factoryId) {
      updateFactory(findFactory(input.factoryId))
    }
  }
</script>

<script setup lang="ts">
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
