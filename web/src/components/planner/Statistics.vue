<template>
  <v-row>
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 flex-grow-1" cols="8">
            <i class="fas fa-list" /><span class="ml-3">World Statistics</span>
          </v-col>
          <v-col class="text-right" cols="4">
            <v-btn
              v-show="!hidden"
              color="primary"
              prepend-icon="fas fa-eye-slash"
              variant="outlined"
              @click="toggleVisibility"
            >Hide
            </v-btn>
            <v-btn
              v-show="hidden"
              color="primary"
              prepend-icon="fas fa-eye"
              variant="outlined"
              @click="toggleVisibility"
            >Show
            </v-btn>
          </v-col>
        </v-row>
        <v-card-text v-show="!hidden" class="text-body-1">
          <!-- Raw Resources Area -->
          <h1 class="text-h5 mb-4">
            <i class="fas fa-globe" />
            <span class="ml-3">Raw Resources</span>
          </h1>
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" /> Shows the amount of raw resources
            consumed by all your factories.
          </p>
          <div v-if="allFactoryRawResources.length > 0">
            <span v-for="(resource, id) in allFactoryRawResources" :key="id">
              <v-chip class="sf-chip blue" variant="tonal">
                <game-asset :subject="resource.id.toString()" type="item" />
                <span class="ml-2">
                  <b>{{ getPartDisplayName(resource.id.toString()) }}</b>: {{ formatNumber(resource.totalAmount) }}/min
                </span>
              </v-chip>
            </span>
          </div>
          <p v-else class="text-body-1">Awaiting Resource Consumption</p>
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />

          <!-- Building Summary Area -->
          <h1 class="text-h5 mb-4">
            <i class="fas fa-building" />
            <span class="ml-3">Building Summary</span>
          </h1>
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" /> Shows the amount buildings of each
            type in all your factories.
          </p>
          <div v-if="totalBuildingsByType.length > 0">
            <span v-for="(building, type) in totalBuildingsByType" :key="type">
              <v-chip class="sf-chip orange" variant="tonal">
                <game-asset :subject="building.name" type="building" />
                <span class="ml-1">
                  <b>{{ getBuildingDisplayName(building.name) ?? "UNKNOWN" }}</b>: {{ formatNumber(building.totalAmount) ?? 0 }}x
                </span>
              </v-chip>
            </span>
          </div>
          <p v-else class="text-body-1">Awaiting Building Construction</p>

          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />

          <!-- Excess Product Area -->
          <h1 class="text-h5 mb-4">
            <i class="fas fa-warehouse" />
            <span class="ml-3">Product Surplus & Deficit</span>
          </h1>
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" /> Shows the amount of surplus or
            deficit of items you have in your factory. These are items that
            either need to be produced more (in red), or items that can be
            stored or sunk (in green)!
          </p>
          <div v-if="factoryProductDifferences.length > 0">
            <v-chip
              v-for="(product) in factoryProductDifferences"
              :key="product.id"
              class="sf-chip"
              :class="{
                'text-green': product.totalDifference > 0,
                'text-red': product.totalDifference < 0,
              }"
            >
              <game-asset :subject="product.id" type="item" />
              <span class="ml-2">
                <b>{{ product.name }}</b>: {{ formatNumber(product.totalDifference) }}/min
              </span>
            </v-chip>
          </div>
          <p v-else class="text-body-1">No Product Surplus or Deficit</p>

          <v-col class="text-center">
            <v-btn
              v-show="!hiddenProducts"
              color="primary"
              prepend-icon="fas fa-eye-slash"
              variant="outlined"
              @click="toggleProductsVisibility"
            >Hide all Products
            </v-btn>
            <v-btn
              v-show="hiddenProducts"
              color="primary"
              prepend-icon="fas fa-eye"
              variant="outlined"
              @click="toggleProductsVisibility"
            >Show all Products
            </v-btn>
          </v-col>

          <!-- Produced Items Area -->
          <div v-show="!hiddenProducts" max-height="500px">
            <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
            <h1 class="text-h5 mb-4">
              <i class="fas fa-conveyor-belt-alt" />
              <span class="ml-3">Produced Items</span>
            </h1>
            <p v-show="helpText" class="mb-4">
              <i class="fas fa-info-circle" /> Shows all the items produced by all
              your factories.
            </p>
            <div v-if="allFactoryProducts.length > 0">
              <v-chip
                v-for="(product) in allFactoryProducts"
                :key="product.id"
                class="sf-chip"
              >
                <span class="mr-2">
                  <game-asset :subject="product.id" type="item" />
                </span>
                <span>
                  <b>{{ product.name }}</b>: {{ formatNumber(product.totalAmount) }}/min
                </span>
              </v-chip>
            </div>
            <p v-else class="text-body-1">Awaiting Production</p>
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

  <script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import {
    getPartDisplayName,
    hasMetricsForPart,
  } from '@/utils/helpers'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // Initialize the 'hidden' ref based on the value in localStorage
  const hidden = ref<boolean>(
    localStorage.getItem('statisticsHidden') === 'true'
  )

  // Watch the 'hidden' ref and update localStorage whenever it changes
  watch(hidden, newValue => {
    localStorage.setItem('statisticsHidden', newValue.toString())
  })

  // Function to toggle visibility
  const toggleVisibility = () => {
    hidden.value = !hidden.value
  }
  // Initialize the 'hidden' ref based on the value in localStorage
  const hiddenProducts = ref<boolean>(
    localStorage.getItem('statisticsProductsHidden') === 'true'
  )

  // Watch the 'hidden' ref and update localStorage whenever it changes
  watch(hiddenProducts, newValue => {
    localStorage.setItem('statisticsProductsHidden', newValue.toString())
  })

  // Function to toggle visibility
  const toggleProductsVisibility = () => {
    hiddenProducts.value = !hiddenProducts.value
  }

  const getBuildingDisplayName = inject('getBuildingDisplayName') as (
    part: string
  ) => string

  // This function calculates total number of buildings for each type of building and creates a new record to store that info in
  const totalBuildingsByType = computed(() => {
    const buildings: Record<
      string,
      {
        name: string;
        totalAmount: number;
        powerPerBuilding: number;
        totalPower: number;
      }
    > = {} // Explicitly define the type
    props.factories.forEach(factory => {
      Object.entries(factory.buildingRequirements).forEach(
        ([key, requirement]) => {
          if (!buildings[key]) {
            // Initialize the building entry
            buildings[key] = {
              name: requirement.name,
              totalAmount: 0,
              powerPerBuilding: requirement.powerPerBuilding,
              totalPower: 0,
            }
          }

          // Accumulate the total amount and total power
          buildings[key].totalAmount += requirement.amount
          buildings[key].totalPower += requirement.totalPower
        }
      )
    })

    // return buildings
    return Object.values(buildings).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  })

  // This function calculates total number of products produced
  const allFactoryProducts = computed(() => {
    const products: Record<
      string,
      { id: string, name: string; totalAmount: number; totalDifference: number }
    > = {}

    props.factories.forEach(factory => {
      factory.products.forEach(product => {
        if (!products[product.id]) {
          products[product.id] = {
            id: product.id,
            name: getPartDisplayName(product.id) ?? product.id,
            totalAmount: 0,
            totalDifference: 0,
          }
        }

        // Accumulate the product amount
        products[product.id].totalAmount += product.amount

        // Add the difference if metrics exist
        if (hasMetricsForPart(factory, product.id)) {
          const difference =
            factory.dependencies.metrics[product.id]?.difference ?? 0
          products[product.id].totalDifference += difference
        }
      })
    })

    // Convert the object to an array and sort it alphabetically by display name
    return Object.values(products).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  })

  // This function calculates total number of raw resources required for all the factories combined
  const allFactoryRawResources = computed(() => {
    const rawResources: Record<string, { id: string; totalAmount: number }> = {}

    props.factories.forEach(factory => {
      Object.values(factory.rawResources).forEach(resource => {
        if (!rawResources[resource.id]) {
          // Initialize the raw resource entry
          rawResources[resource.id] = {
            id: resource.id,
            totalAmount: 0,
          }
        }

        // Accumulate the resource amount
        rawResources[resource.id].totalAmount += resource.amount
      })
    })

    // Convert the object to an array and sort it alphabetically by display name
    return Object.values(rawResources).sort((a, b) =>
      getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id))
    )
  })

  // This function calculates total number of products produced and gets the difference between demand and supply (to see if we have a surplus of products or not)
  const factoryProductDifferences = computed(() => {
    const differences: Record<string, {id: string, name: string; totalDifference: number }> =
      {}

    props.factories.forEach(factory => {
      Object.entries(factory.dependencies.metrics).forEach(([partId, metric]) => {
        if (metric.difference !== 0) {
          if (!differences[partId]) {
            differences[partId] = {
              id: partId,
              name: getPartDisplayName(partId) ?? partId,
              totalDifference: 0,
            }
          }
          // Accumulate the difference
          differences[partId].totalDifference += metric.difference
        }
      })
    })

    return Object.values(differences).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  })
  </script>
