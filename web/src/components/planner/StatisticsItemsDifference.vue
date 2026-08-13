<template>
  <div class="d-flex align-center">
    <h4 class="text-h4">
      <i class="fas fa-warehouse" />
      <span class="ml-3">Product Surplus & Deficit</span>
    </h4>
    <v-chip
      v-if="surplusCount > 0"
      id="stats-surplus-summary"
      class="sf-chip green ml-3"
      variant="tonal"
    >
      {{ surplusCount }} in surplus
    </v-chip>
    <v-chip
      v-if="deficitCount > 0"
      id="stats-deficit-summary"
      class="sf-chip red"
      :class="{ 'ml-3': surplusCount === 0 }"
      variant="tonal"
    >
      {{ deficitCount }} in deficit
    </v-chip>
    <v-btn
      class="ml-auto"
      color="primary"
      :prepend-icon="hidden ? 'fas fa-eye' : 'fas fa-eye-slash'"
      size="small"
      :variant="hidden ? 'outlined' : 'flat'"
      @click="hidden = !hidden"
    >{{ hidden ? 'Show' : 'Hide' }}</v-btn>
  </div>
  <template v-if="!hidden">
    <p v-show="helpText" class="mb-4">
      <i class="fas fa-info-circle" /> Shows the amount of surplus or
      deficit of items you have in your factory. These are items that
      either need to be produced more (in red), or items that can be
      stored or sunk (in green)!
    </p>
    <v-table
      v-if="factoryProductDifferences.length > 0"
      id="stats-surplus-deficit"
      class="stats-table"
      density="compact"
    >
      <thead>
        <tr>
          <th>Product</th>
          <th class="text-right">Net</th>
          <th>Where</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="product in factoryProductDifferences" :key="product.id">
          <td>
            <v-chip
              class="sf-chip no-margin"
              :class="product.amountRemaining > 0 ? 'green' : 'red'"
              variant="tonal"
            >
              <game-asset clickable :subject="product.id" type="item" />
              <b class="ml-2">{{ getPartDisplayName(product.id) }}</b>
            </v-chip>
          </td>
          <td class="text-right">
            <b :class="amountClass(product.amountRemaining)">{{ formatNumber(product.amountRemaining) }}</b>/min
          </td>
          <td>
            <!-- Which factories the figure came from. A plan-wide zero routinely hides one
                 factory 200 over and another 200 short, and the total alone says neither. The
                 item is named in the first column, so the chip carries only the factory and the
                 number it contributes. -->
            <div class="d-flex flex-wrap ga-2">
              <div
                v-for="source in product.sources"
                :key="source.id"
                class="factory-group-chip clickable"
                @click="navigateToFactory(source.id)"
              >
                <factory-icon-display class="ml-1" :icon="source.icon" size="20" />
                <span class="mx-2"><b>{{ source.name }}</b></span>
                <v-chip class="sf-chip small" :class="source.amount > 0 ? 'green' : 'red'">
                  {{ formatNumber(source.amount) }}/min
                </v-chip>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </v-table>
    <p v-else class="text-body-1">No Product Surplus or Deficit</p>
  </template>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import {
    getPartDisplayName,
  } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalParts } from '@/utils/statistics'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // This function calculates total number of products produced and gets the difference between demand and supply (to see if we have a surplus of products or not)
  const factoryProductDifferences = computed(() => calculateTotalParts(props.factories).filter(product => product.amountRemaining !== 0))

  // Header at-a-glance counts, shown whether the section is open or collapsed.
  const surplusCount = computed(() => factoryProductDifferences.value.filter(product => product.amountRemaining > 0).length)
  const deficitCount = computed(() => factoryProductDifferences.value.filter(product => product.amountRemaining < 0).length)

  const amountClass = (amount: number) => (amount > 0 ? 'text-success' : 'text-error')

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('statisticsSurplusHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('statisticsSurplusHidden', value.toString())
  })
</script>

<style lang="scss" scoped>
.stats-table {
  background-color: transparent;

  // The factory column carries the width; the other two only need enough not to wrap their own
  // contents, or one long factory name folds the product name onto two lines.
  th:nth-child(1),
  td:nth-child(1),
  th:nth-child(2),
  td:nth-child(2) {
    white-space: nowrap;
    width: 1%;
  }

  // v-table sizes cells for one line; these rows hold chips and wrap.
  td {
    padding-top: 6px !important;
    padding-bottom: 6px !important;
    height: auto !important;
  }
}
</style>
