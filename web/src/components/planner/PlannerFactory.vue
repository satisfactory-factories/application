<template>
  <v-row>
    <v-col>
      <v-card :id="factory.id" :class="factoryClass(factory)">
        <v-row class="header">
          <v-col class="flex-grow-1" cols="auto" md="8">
            <div class="text-h6 text-md-h5">
              <i class="fas fa-industry" />
              <input
                v-model="factory.name"
                class="ml-3 pl-0 factory-name"
                placeholder="Factory Name"
              >
            </div>
            <div class="d-flex align-center">
              <div v-if="factory.inSync">
                <v-chip class="sf-chip small green no-margin" @click="setSync(factory)">
                  <i class="fas fa-check-square" />
                  <span class="ml-2">In sync with game</span>
                </v-chip>
              </div>
              <div v-if="factory.inSync === false">
                <v-chip class="sf-chip small orange no-margin" @click="setSync(factory)">
                  <i class="fas fa-times-square" />
                  <span class="ml-2">Out of sync with game</span>
                </v-chip>
              </div>
              <div v-if="factory.inSync === null">
                <v-chip class="border border-gray border-dashed" :disabled="!factory.products[0]?.id" @click="setSync(factory)">
                  <i class="fas fa-question" />
                  <span class="ml-2">Mark as in sync with game</span>
                </v-chip>
              </div>
              <v-tooltip right>
                <template #activator="{ props }">
                  <div class="ml-2 text-grey" v-bind="props">
                    <i class="fas fa-info-circle" />
                  </div>
                </template>
                <span>Game Sync is when you have implemented the factory inside the game.<br> When it drops out of sync, there are changes that you need to implement.<br> When a factory's products are changed, the factory will be out of sync, or if you set it manually.
                </span>
              </v-tooltip>
            </div>
          </v-col>
          <v-col class="text-right pt-0 pt-md-3" cols="auto" md="4">
            <factory-debug :is-compact="smAndDown" :subject="factory" subject-type="Factory" />
            <v-btn
              class="mr-2 rounded"
              color="primary"
              :disabled="factory.displayOrder === 0"
              icon="fas fa-arrow-up"
              size="small"
              title="Move Factory Up"
              variant="outlined"
              @click="moveFactory(factory, 'up')"
            />
            <v-btn
              class="mr-2 rounded"
              color="primary"
              :disabled="factory.displayOrder === totalFactories - 1"
              icon="fas fa-arrow-down"
              size="small"
              title="Move Factory Down"
              variant="outlined"
              @click="moveFactory(factory, 'down')"
            />
            <v-btn
              v-show="!factory.hidden"
              class="mr-2 rounded"
              color="secondary"
              icon="fas fa-compress-alt"
              size="small"
              title="Collapse Factory"
              variant="outlined"
              @click="factory.hidden = true"
            />
            <v-btn
              v-show="factory.hidden"
              class="mr-2 rounded"
              color="secondary"
              icon="fas fa-expand-alt"
              size="small"
              title="Expand Factory"
              variant="outlined"
              @click="factory.hidden = false"
            />
            <v-btn
              class="mr-2"
              color="orange rounded"
              icon="fas fa-copy"
              size="small"
              title="Copy Factory"
              variant="outlined"
              @click="copyFactory(factory)"
            />
            <v-btn
              color="red rounded"
              icon="fas fa-trash"
              size="small"
              title="Delete Factory"
              variant="outlined"
              @click="confirmDelete() && deleteFactory(factory)"
            />
          </v-col>
        </v-row>
        <v-card-text v-show="!factory.hidden">
          <ProductsAndPower
            :factory="factory"
            :help-text="helpText"
          />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <planner-factory-imports
            :factory="factory"
            :help-text="helpText"
          />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <planner-factory-satisfaction
            :factory="factory"
            :help-text="helpText"
          />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <v-row>
            <v-col cols="12" md="6">
              <planner-factory-todos
                :factory="factory"
                :help-text="helpText"
              />
            </v-col>
            <v-col cols="12" md="6">
              <planner-factory-notes
                :factory="factory"
                :help-text="helpText"
              />
            </v-col>
          </v-row>
        </v-card-text>
        <!-- Hidden factory collapse -->
        <v-card-text v-show="factory.hidden" class="pa-0">
          <div
            v-if="factory.inputs.length > 0 || Object.keys(factory.rawResources).length > 0"
            class="text-body-1 py-2 px-4 pb-1"
            :class="factory.products.length > 0 ? 'border-b-md' : ''"
          >
            <div class="d-flex align-center">
              <p class="mr-2">Imports:</p>
              <div
                v-for="(input, inputIndex) in factory.inputs"
                :key="inputIndex"
                class="mr-2 pl-2 no-bottom rounded factory-link"
                @click="navigateToFactory(input.factoryId as number)"
              >
                <template v-if="input.factoryId">
                  <i class="fas fa-industry" />
                  <span class="ml-2">
                    <b>{{ findFactory(input.factoryId as number).name }}:</b>
                  </span>
                  <v-chip
                    class="sf-chip blue ml-2"
                  >
                    <game-asset
                      v-if="input.outputPart"
                      height="32"
                      :subject="input.outputPart"
                      type="item"
                      width="32"
                    />
                    <span class="ml-2"><b>{{ getPartDisplayName(input.outputPart) }}:</b> {{ formatNumber(input.amount) }}/min</span>
                  </v-chip>
                </template>
              </div>
              <div
                v-for="(resource, resourceKey) in factory.rawResources"
                :key="resourceKey"
                class="mr-2 pl-2 no-bottom rounded"
              >
                <i class="fas fa-hard-hat" />
                <span class="ml-2">
                  <b>{{ "Raw Resource(s)" }}:</b>
                </span>
                <v-chip
                  class="sf-chip blue ml-2"
                >
                  <game-asset
                    v-if="resource.id"
                    height="32"
                    :subject="resource.id"
                    type="item"
                    width="32"
                  />
                  <span class="ml-2"><b>{{ getPartDisplayName(resource.id) }}:</b> {{ formatNumber(resource.amount) }}/min</span>
                </v-chip>
              </div>
            </div>
          </div>
          <v-row
            class="py-2 px-4 my-0 mx-0"
            :class="hasExports(factory) ? 'border-b-md' : ''"
          >
            <p v-if="factory.products.length === 0" class="text-body-1">Empty factory! Select a product!</p>
            <div v-else>
              <p class="text-body-1 d-inline-block mr-2">Producing: </p>
              <v-chip
                v-for="part in factory.products"
                :key="`${factory.id}-${part.id}`"
                class="sf-chip"
              >
                <span class="mr-2">
                  <game-asset
                    v-if="part.id"
                    :subject="part.id"
                    type="item"
                  />
                </span>
                <span>
                  <b>{{ getPartDisplayName(part.id) }}</b>: {{ formatNumber(part.amount) }}/min
                </span>
                <span
                  v-if="hasMetricsForPart(factory, part.id) && factory.dependencies.metrics[part.id].difference !== 0"
                  class="ml-2"
                  :class="differenceClass(factory.dependencies.metrics[part.id].difference)"
                >({{ formatNumber(factory.dependencies.metrics[part.id].difference) }}/min)</span>
              </v-chip>
            </div>
          </v-row>
          <div
            v-if="factory.dependencies?.requests && Object.keys(factory.dependencies?.requests).length > 0"
            class="text-body-1 py-2 px-4 pb-1"
          >
            <div class="d-flex align-center">
              <p class="mr-2">Exports:</p>
              <div
                v-for="dependant in Object.keys(factory.dependencies.requests)"
                :key="dependant"
                class="mr-2 pl-2 no-bottom rounded factory-link"
                @click="navigateToFactory(dependant)"
              >
                <i class="fas fa-industry" />
                <span class="ml-2">
                  <b>{{ findFactory(dependant).name }}:</b>
                </span>
                <v-chip
                  v-for="part in factory.dependencies.requests[dependant]"
                  :key="part.part"
                  class="sf-chip blue ml-2"
                >
                  <game-asset
                    v-if="part.part"
                    height="32"
                    :subject="part.part"
                    type="item"
                    width="32"
                  />
                  <span class="ml-2"><b>{{ getPartDisplayName(part.part) }}:</b> {{ formatNumber(part.amount) }}/min</span>
                </v-chip>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
  <v-divider class="my-6 opacity-50" color="blue" thickness="5px" />
</template>

<script setup lang="ts">
  import { defineProps, inject } from 'vue'
  import { Factory, FactoryDependencyMetrics, FactoryItem } from '@/interfaces/planner/FactoryInterface'
  import { DataInterface } from '@/interfaces/DataInterface'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useDisplay } from 'vuetify'
  import ProductsAndPower from '@/components/planner/products/ProductsAndPower.vue'

  const findFactory = inject('findFactory') as (id: string | number) => Factory
  const updateFactory = inject('updateFactory') as (factory: Factory) => void
  const copyFactory = inject('copyFactory') as (factory: Factory) => void
  const deleteFactory = inject('deleteFactory') as (factory: Factory) => void
  const moveFactory = inject('moveFactory') as (factory: Factory, direction: string) => void
  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void
  const getProduct = inject('getProduct') as (factory: Factory, productId: string) => FactoryItem

  defineProps<{
    factory: Factory
    gameData: DataInterface
    helpText: boolean
    totalFactories: number;
  }>()

  const { smAndDown } = useDisplay()

  const factoryClass = (factory: Factory) => {
    return {
      'factory-card': true,
      problem: factory.hasProblem,
      needsSync: !factory.hasProblem && factory.inSync !== null ? !factory.inSync : false,
    }
  }

  const confirmDelete = (message = 'Are you sure you want to delete this factory?') => {
    return confirm(message)
  }

  const differenceClass = (difference: number) => {
    return {
      'text-green': difference > 0,
      'text-red': difference < 0,
    }
  }

  const hasMetricsForPart = (factory: Factory, part: string) => {
    return factory.dependencies.metrics && factory.dependencies.metrics[part]
  }

  const hasExports = (factory: Factory) => {
    if (!factory.dependencies?.requests) return false
    return Object.keys(factory.dependencies.requests).length > 0
  }

  const fixProduction = (factory: Factory, productId: string): void => {
    const product = getProduct(factory, productId)

    // If the product is not found, return
    if (!product) {
      console.error(`Could not find product for ${productId} to fix!`)
      return
    }

    // Update the production amount to match requirement
    product.amount = factory.parts[productId].amountRequired
    updateFactory(factory)
  }

  const fixExport = (factory: Factory, productId: string) => {
    const product = getProduct(factory, productId)

    // If the product is not found, return
    if (!product) {
      console.error(`Could not find product for ${productId} to fix!`)
      return
    }

    const metric = getRequestMetricsForFactoryByPart(factory, product.id)

    if (!metric) {
      console.error(`Could not get request metric to fix shortage for ${product.id}`)
      return
    }

    const partData = factory.parts[product.id]
    product.amount = partData.amountRequired // Fix both exports and production at the same time
    updateFactory(factory)
  }

  const getRequestMetricsForFactoryByPart = (
    factory: Factory,
    part: string
  ): FactoryDependencyMetrics | undefined => {
    // Requests may be empty.
    if (!factory?.dependencies.metrics || !part || !factory.id) {
      return undefined
    }

    return factory.dependencies?.metrics[part] ?? {}
  }

  const setSync = (factory: Factory) => {
    factory.inSync = !factory.inSync

    // Record what the sync'ed state is
    if (factory.inSync) {
      factory.syncState = {}

      // Get the current products of the factory and set them
      factory.products.forEach(product => {
        factory.syncState[product.id] = {
          amount: product.amount,
          recipe: product.recipe,
        }
      })
    }
  }

  provide('fixProduction', fixProduction)
  provide('fixExport', fixExport)
  provide('getRequestMetricsForFactoryByPart', getRequestMetricsForFactoryByPart)
</script>

<style lang="scss" scoped>
.factory-name {
  width: 85%;
  padding: 6px;
  border-radius: 4px;
  transition: background-color 0.3s;

  &:hover {
    cursor: pointer;
    background-color: #323232;
  }
}

.factory-link {
  &:hover {
    cursor: pointer;
    background-color: #323232;
  }
}
</style>
