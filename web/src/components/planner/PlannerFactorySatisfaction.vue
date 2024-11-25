<template>
  <div>
    <h2
      v-show="factory.requirementsSatisfied && Object.keys(factory.parts).length > 0"
      class="text-h5 mb-4"
    >
      <i class="fas fa-check" />
      <span class="ml-3">Satisfaction</span>
    </h2>
    <h2
      v-show="!factory.requirementsSatisfied"
      class="text-h5 mb-4 text-red"
    >
      <i class="fas fa-times" />
      <span class="ml-3">Satisfaction</span>
    </h2>
    <h2
      v-show="factory.requirementsSatisfied && Object.keys(factory.parts).length === 0"
      class="text-h5 mb-4"
    >
      <i class="fas fa-question" />
      <span class="ml-3">Satisfaction</span>
    </h2>

    <v-row v-if="Object.keys(factory.parts).length > 0">
      <v-col cols="12" md="7">
        <v-card class="border-md sub-card">
          <v-card-title>
            <h2 class="text-h6">
              <i class="fas fa-cube" /><span class="ml-2">Items</span>
            </h2>
          </v-card-title>
          <v-card-text class="text-body-1 pb-0 pt-4">
            <p v-show="helpText" class="text-body-2 mb-4">
              <i class="fas fa-info-circle" /> Listed as [supply/demand]. Supply is created by adding imports to the factory or producing the product internally.
            </p>
            <v-row
              v-for="(part, partId) in satisfactionDisplay"
              :key="partId"
              class="mx-n4 mb-2 pb-2 border-b no-bottom"
              :class="isSatisfiedStyling(part)"
            >
              <v-col align-self="center" class="flex-grow-0 pa-0 pl-3">
                <game-asset
                  height="48"
                  :subject="partId"
                  type="item"
                  width="48"
                />
              </v-col>
              <v-col class="py-0">
                <p v-if="part.satisfied">
                  <v-icon icon="fas fa-check" />
                  <span class="ml-2">
                    <b>{{ getPartDisplayName(partId) }}</b><br>{{ formatNumber(part.amountSupplied) }}/{{ formatNumber(part.amountRequired) }}/min
                  </span>
                </p>
                <p v-else>
                  <v-icon icon="fas fa-times" />
                  <span class="ml-2">
                    <b>{{ getPartDisplayName(partId) }}</b><br>{{ formatNumber(part.amountSupplied) }}/{{ formatNumber(part.amountRequired) }} /min
                  </span>
                </p>
              </v-col>
              <v-col align-self="center" class="text-right flex-shrink-0 py-0">
                <v-btn
                  v-if="!getProduct(factory, partId) && !isItemRawResource(partId) && !part.satisfied"
                  class="ml-2 my-1"
                  color="primary"
                  size="small"
                  variant="outlined"
                  @click="addProduct(factory, partId, part.amountRemaining)"
                >+&nbsp;<i class="fas fa-cube" /><span class="ml-1">Product</span>
                </v-btn>
                <v-btn
                  v-if="getProduct(factory, partId) && !isItemRawResource(partId) && !part.satisfied"
                  class="ml-2 my-1"
                  color="green"
                  size="small"
                  @click="fixProduction(factory, partId)"
                ><i class="fas fa-wrench" /><span class="ml-1">Fix Production</span>
                </v-btn>
                <v-btn
                  v-if="getImport(factory, partId) && !part.satisfied"
                  class="ml-2 my-1"
                  color="green"
                  size="small"
                  @click="fixSatisfactionImport(factory, partId)"
                >&nbsp;<i class="fas fa-arrow-up" /><span class="ml-1">Fix Import</span>
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
      <br><br>
      <v-col cols="12" md="5">
        <v-card class="sub-card border-md">
          <v-card-title>
            <h2 class="text-h6">
              <i class="fas fa-building" />
              <span class="ml-3">Factory Buildings</span>
            </h2>
          </v-card-title>
          <v-card-text class="text-body-1 pb-2">
            <div
              v-for="([_, buildingData], buildingIndex) in Object.entries(factory.buildingRequirements)"
              :key="buildingIndex"
              style="display: inline;"
            >
              <v-chip
                class="sf-chip orange"
                variant="tonal"
              >
                <game-asset
                  :subject="buildingData.name"
                  type="building"
                />
                <span class="ml-2">
                  <b>{{ getBuildingDisplayName(buildingData.name) ?? 'UNKNOWN' }}</b>: {{ formatNumber(buildingData.amount) ?? 0 }}x
                </span>
              </v-chip>
            </div>
          </v-card-text>
        </v-card>
        <v-card class="sub-card border-md">
          <v-card-title>
            <h2 class="text-h6">
              <i class="fas fa-plug" />
              <span class="ml-3">Factory Power</span>
            </h2>
          </v-card-title>
          <v-card-text class="text-body-1 pb-2">
            <v-chip
              class="sf-chip yellow"
              variant="tonal"
            >
              <i class="fas fa-bolt" />
              <span class="ml-2">
                {{ formatNumber(factory.totalPower) }} MW
              </span>
            </v-chip>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <p v-else class="text-body-1">Awaiting product selection or requirements outside of Raw Resources.</p>
  </div>
</template>
<script setup lang="ts">
  import {
    Factory,
    FactoryInput,
    FactoryItem,
    PartMetrics,
  } from '@/interfaces/planner/FactoryInterface'
  import { computed, inject } from 'vue'
  import { addProductToFactory } from '@/utils/factory-management/products'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useGameDataStore } from '@/stores/game-data-store'

  const fixProduction = inject('fixProduction') as (factory: Factory, partIndex: string) => void
  const getBuildingDisplayName = inject('getBuildingDisplayName') as (part: string) => string
  const getProduct = inject('getProduct') as (factory: Factory, productId: string) => FactoryItem | undefined
  const isItemRawResource = inject('isItemRawResource') as (part: string) => boolean
  const updateFactory = inject('updateFactory') as (factory: Factory) => void

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const { getDefaultRecipeForPart } = useGameDataStore()

  // Calculated function showing parts displayed if the amountRequired > 0
  const satisfactionDisplay = computed(() => {
    return Object.entries(props.factory.parts)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_, value]) => value.amountRequired > 0)
      .reduce((acc, [key, value]) => {
        acc[key] = value
        return acc
      }, {} as Record<string, PartMetrics>)
  })

  const isSatisfiedStyling = (part: PartMetrics) => {
    return {
      'text-green': part.satisfied,
      'text-red': !part.satisfied,
    }
  }

  const addProduct = (factory: Factory, part: string, amount: number): void => {
    addProductToFactory(factory, {
      id: part,
      amount,
      recipe: getDefaultRecipeForPart(part),
    })

    updateFactory(factory)
  }

  const getImport = (factory: Factory, partIndex: string): FactoryInput | undefined => {
    // Search the inputs array for the outputPart using the part index
    return factory.inputs.find(input => input.outputPart === partIndex)
  }

  const fixSatisfactionImport = (factory: Factory, partIndex: string) => {
    const itemImport = getImport(factory, partIndex)

    // If the import is not found
    if (!itemImport) {
      console.error(`Could not find import for ${partIndex} to fix!`)
      return
    }

    // Set the import amount to the required amount
    itemImport.amount = factory.parts[partIndex].amountRequired
    updateFactory(factory)
  }
</script>
