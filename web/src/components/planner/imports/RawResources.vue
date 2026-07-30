<template>
  <v-card v-if="validToDisplay" class="mb-4 border-md sub-card">
    <v-card-title class="d-flex flex-wrap align-center ga-2">
      <span><i class="fas fa-hard-hat" /><span class="ml-2">Raw Resources</span></span>
      <v-spacer />
      <v-select
        :id="`${factory.id}-raw-assumption`"
        density="compact"
        hide-details
        :items="assumptionOptions"
        label="Raw supply"
        :model-value="factory.assumeRawInputs ?? null"
        variant="outlined"
        width="230px"
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
      </v-chip>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { factoryAssumesRawInputs } from '@/utils/factory-management/parts'
  import { CalculationModes } from '@/utils/factory-management/factory'

  const props = defineProps<{ factory: Factory }>()

  const updateFactory = inject('updateFactory') as (factory: Factory, modes?: CalculationModes) => void

  const assumptionOptions = [
    { title: 'Use global setting', value: null },
    { title: 'Assumed supplied', value: true },
    { title: 'Not assumed', value: false },
  ]

  const assumed = computed(() => factoryAssumesRawInputs(props.factory))

  const setAssumption = (value: boolean | null) => {
    props.factory.assumeRawInputs = value
    updateFactory(props.factory)
  }

  // Shown whenever the world has to provide something, whether that's being assumed away or
  // standing as a shortage. Reading factory.rawResources covers both. Fixes #266.
  const validToDisplay = computed(() => Object.keys(props.factory.rawResources).length > 0)
</script>
