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
              :items="importFactorySelections(inputIndex)"
              label="Factory"
              max-width="300px"
              variant="outlined"
              width="300px"
              @update:model-value="(newValue) => handleFactoryChange(newValue, factory, inputIndex)"
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
              :items="importPartSelections(input.factoryId, inputIndex)"
              label="Item"
              max-width="350px"
              variant="outlined"
              width="350px"
              @input="updateFactory(factory)"
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
              v-show="requirementSatisfied(factory, input.outputPart) && inputOverflow(factory, input.outputPart)"
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
        <span v-if="ableToImport(factory) === 'rawOnly'" class="ml-2">(This factory is only using raw resources and requires no imports.)</span>
        <span v-if="ableToImport(factory) === 'noImportFacs'" class="ml-2">(There are no factories that have exports able to supply this factory.)</span>
      </div>
    </div>
    <p v-else class="text-body-1">Awaiting product selection.</p>
  </div>
</template>

<script setup lang="ts">
  import { defineProps } from 'vue'
  import { Factory, FactoryInput, PartMetrics } from '@/interfaces/planner/FactoryInterface'
  import { addInputToFactory } from '@/utils/factory-management/inputs'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useDisplay } from 'vuetify'

  const findFactory = inject('findFactory') as (id: string | number) => Factory
  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const factoriesWithExports = inject('factoriesWithExports') as ComputedRef<Factory[]>
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
    updateFactory(factory)

    // Also update the other factory affected
    if (input.factoryId) {
      updateFactory(findFactory(input.factoryId))
    }
  }

  // Check if another factory has exports that can be used as imports for the current factory
  const possibleImports = computed(() => {
    const factoriesWithRequiredParts = new Map<number, Factory>()

    // Get all parts in the factory that have requirements. Do this by checking each item in the parts object for `amountRequired > 0`
    // This denotes parts that should be candidates for import, even if they have an internal production.
    // The list should be simply a list of part names
    const partsWithRequirements = Object.keys(props.factory.parts).filter(part => {
      return props.factory.parts[part].amountRequired > 0
    })

    // Loop through each part in the requirements of the current factory prop
    partsWithRequirements.forEach(requiredPart => {
      // Find any factories that are exporting this part
      const validFactories = factoriesWithExports.value.filter(importFac => {
        // Loop through all the factory's parts and see if they have any export candidates
        return Object.keys(importFac.parts).some(part => {
          const partData = importFac.parts[part]
          return part === requiredPart && partData.exportable
        })
      })

      validFactories.forEach(fac => factoriesWithRequiredParts.set(fac.id, fac))
    })

    // Remove the input's factory to prevent referencing itself
    if (factoriesWithRequiredParts.get(props.factory.id)) {
      factoriesWithRequiredParts.delete(props.factory.id)
    }

    const factoriesArray = Array.from(factoriesWithRequiredParts.values())

    // Sort the factories by name
    factoriesArray.sort((a, b) => a.name.localeCompare(b.name))

    return factoriesArray
  })

  const possibleImportsAfterSelections = computed(() => {
    // Collate all the currently selected factories and their selected parts
    const selectedPartsByFactory = new Map<number, Set<string>>()
    props.factory.inputs.forEach(input => {
      if (input.factoryId && input.outputPart) {
        if (!selectedPartsByFactory.has(input.factoryId)) {
          selectedPartsByFactory.set(input.factoryId, new Set<string>())
        }
        const partSet = selectedPartsByFactory.get(input.factoryId)
        // Keep TS happy...
        if (!partSet) {
          throw new Error('Unable to setup set, this should not be possible!')
        }
        partSet.add(input.outputPart)
      }
    })
    // Collate all the possible parts that can be imported, that the factory needs
    const remainingFactories = new Map<number, Factory>()
    possibleImports.value.forEach(fac => {
      // If the factory is already selected, skip it
      if (selectedPartsByFactory.has(fac.id)) {
        return
      }

      // If the factory is not already selected, add it to the list
      remainingFactories.set(fac.id, fac)
    })

    return remainingFactories
  })

  const ableToImport = (factory: Factory): string | boolean => {
    if (factory.usingRawResourcesOnly) {
      return 'rawOnly'
    }

    const importCandidates = possibleImportsAfterSelections.value

    if (importCandidates.size === 0) {
      return 'noImportFacs'
    }

    return true
  }

  const importFactorySelections = (inputIndex: number): {title: string, value: string | number}[] => {
    // Calculate the currently selected imports and don't show the factory on the list if all parts are already imported
    // We need to also ensure that if the input already has a factory selected, it is still shown in the list otherwise it'll delete itself.
    // In the end, we only want to show: 1. Factories that have exportable parts that are NOT selected, and parts that match the current selection

    // Clone the possible candidates map
    const remainingFactories = new Map(possibleImportsAfterSelections.value)

    // We also need to drop in the currently selected input's factory if it has one
    if (props.factory.inputs[inputIndex].factoryId) {
      remainingFactories.set(props.factory.inputs[inputIndex].factoryId, findFactory(props.factory.inputs[inputIndex].factoryId))
    }

    // Map to the required format for the dropdown
    return Array.from(remainingFactories.values().map(factory => ({
      title: factory.name,
      value: factory.id,
    })))
  }

  // Gets the products of another factory for dependencies
  const importPartSelections = (inputFactoryId: number | null, inputIndex: number) => {
    if (!inputFactoryId || inputFactoryId === 0) {
      // User may still be selecting a factory
      return []
    }

    // Get the factory by ID
    const inputFactory = findFactory(inputFactoryId)
    if (!inputFactory || !inputFactory.id) {
      console.error('Tried to get outputs for a factory that does not exist:', inputFactoryId)
      return []
    }

    const selectedParts = new Set<string>()

    // Go through the factory inputs and add them to the set
    props.factory.inputs.forEach((input, index) => {
      // We want to exclude selection of an item IF we still have a demand for it
      if (!input.outputPart) {
        return // It's not got a part selected so who cares
      }
      const isStillInDemand = props.factory.parts[input.outputPart].amountRemaining > 0

      if (isStillInDemand && index !== inputIndex && input.outputPart) {
        selectedParts.add(input.outputPart)
      }
    })

    const exportableParts = Object.keys(inputFactory.parts)
      .filter(part => inputFactory.parts[part].exportable)

    // We need to filter by both exportable parts AND if the part is in the parts we need for the factory
    const exportablePartsWithRequirements = exportableParts
      .filter(part => props.factory.parts[part] && props.factory.parts[part].amountRequired > 0)

    // Now go through the available imports and filter out any that are already selected
    const availableParts = exportablePartsWithRequirements
      .filter(part => !selectedParts.has(part))

    return Object.values(availableParts)
      .map(part => ({
        title: getPartDisplayName(part), // For display purposes
        value: part, // Value is the ID
      }))
  }

  const handleFactoryChange = (newValue: number, factory: Factory, inputIndex: number) => {
    // Initiate a factory update for all factories involved
    updateFactory(factory) // This factory

    // Grab a difference between the current input state and the old one
    const oldInputs = factory.previousInputs
    const newInputs = factory.inputs

    // Find the difference
    const diff = oldInputs.filter((input, index) => {
      return JSON.stringify(input) !== JSON.stringify(newInputs[index])
    })

    console.log('handleFactoryChange: Difference:', diff)
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

  const inputOverflow = (factory: Factory, part: string | null): boolean => {
    if (!part) {
      console.error('inputOverflow: No part provided for input overflow check.')
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

    updateFactory(factory)
  }

  const updateFactories = (factory: Factory, input: FactoryInput) => {
    // Update this factory
    updateFactory(factory)

    if (input.factoryId) {
      // Update the other factory
      updateFactory(findFactory(input.factoryId))
    }
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
