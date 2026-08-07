<template>
  <v-card v-if="validToDisplay" class="mb-4 border-md sub-card" :class="{ problem: !assumed }">
    <v-card-title class="d-flex flex-wrap align-center ga-2">
      <span><i class="fas fa-hard-hat" /><span class="ml-2">Raw Resources</span></span>
      <v-spacer />
      <v-select
        :id="`${factory.id}-raw-assumption`"
        class="flex-grow-0"
        density="compact"
        hide-details
        :items="assumptionOptions"
        label="Raw supply"
        :model-value="factory.assumeRawInputs ?? null"
        style="max-width: 210px"
        variant="outlined"
        @update:model-value="setAssumption($event)"
      />
    </v-card-title>
    <v-card-text class="text-body-2">
      <p v-if="assumed" class="mb-4">
        <i class="fas fa-info-circle" /> Raw resources (e.g. Iron Ore) aren't defined as imports. It is assumed you'll supply them sufficiently. If you'd rather plan the mining out, switch the raw supply above to "Not assumed" — you can then add extractors as products, or import from a dedicated mine factory.
      </p>
      <p v-else class="mb-4">
        <i class="fas fa-exclamation-triangle" /> This factory isn't assuming raw supply, so the amounts below are shortages. Add an extractor as a product to mine them here, or import them from a mine factory.
      </p>
      <v-chip
        v-for="(resource, resourceKey) in factory.rawResources"
        :key="resourceKey"
        class="sf-chip"
        :class="assumed ? 'cyan' : 'red'"
      >
        <game-asset clickable :subject="resourceKey.toString() ?? 'unknown'" type="item" />
        <span class="ml-2">
          <b>{{ getPartDisplayName(resourceKey.toString()) }}</b>: {{ formatNumber(resource.amount) }}/min
        </span>
        <!-- Mine it here, at exactly the amount the factory is short of. -->
        <tooltip :text="`Extract ${formatNumber(resource.amount)}/min of ${getPartDisplayName(resourceKey.toString())} in this factory`">
          <v-btn
            v-if="canExtract(resourceKey.toString())"
            :id="`${factory.id}-extract-${resourceKey}`"
            class="ml-2 extract-btn"
            color="primary"
            min-width="0"
            rounded="pill"
            size="x-small"
            variant="flat"
            @click="extractHere(resourceKey.toString(), resource.amount)"
          >
            <i class="fas fa-plus mr-1" /><i class="fas fa-cube" />
          </v-btn>
        </tooltip>
      </v-chip>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
  import { factoryAssumesRawInputs } from '@/utils/factory-management/parts'
  import { addProductToFactory, getProduct } from '@/utils/factory-management/products'
  import { getExtractionRecipeForPart } from '@/utils/factory-management/building-groups/extraction'
  import { CalculationModes } from '@/utils/factory-management/factory'

  const props = defineProps<{ factory: Factory }>()

  const updateFactory = inject('updateFactory') as (factory: Factory, modes?: CalculationModes) => void

  const assumptionOptions = [
    { title: 'Use plan default', value: null },
    { title: 'Assumed supplied', value: true },
    { title: 'Not assumed', value: false },
  ]

  const assumed = computed(() => factoryAssumesRawInputs(props.factory))

  // Collectables and resource-well gases have no extractor, so there is nothing to offer.
  const canExtract = (part: string) => !!getExtractionRecipeForPart(part)

  // Adds the extraction as a product at the exact shortfall. It lands on the recipe's reference
  // extractor (Miner Mk.1, normal purity) and the building groups solve the count from there —
  // the user then dials in the real marks and purities per group.
  const extractHere = (part: string, amount: number) => {
    const recipe = getExtractionRecipeForPart(part)
    if (!recipe) {
      return
    }

    const existing = getProduct(props.factory, part, true) as FactoryItem | undefined
    if (existing && existing.recipe === recipe) {
      existing.amount += amount
    } else {
      addProductToFactory(props.factory, { id: part, recipe, amount })
    }

    updateFactory(props.factory)
  }

  const setAssumption = (value: boolean | null) => {
    props.factory.assumeRawInputs = value
    updateFactory(props.factory)
  }

  // Shown whenever the world has to provide something, whether that's being assumed away or
  // standing as a shortage. Reading factory.rawResources covers both. Fixes #266.
  const validToDisplay = computed(() => Object.keys(props.factory.rawResources).length > 0)
</script>

<style lang="scss" scoped>
  // Vuetify sizes an x-small button to a square when its content is two bare icons, which
  // reads as a circle against the pill radius. Let it size to its content instead.
  .extract-btn {
    width: auto;
    padding: 0 10px !important;
  }
</style>
