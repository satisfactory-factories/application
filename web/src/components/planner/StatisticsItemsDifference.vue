<template>
  <div class="d-flex align-center">
    <h4 class="text-h4">
      <i class="fas fa-warehouse" />
      <span class="ml-3">Item Production</span>
    </h4>
    <v-chip
      v-if="surplusCount > 0"
      id="stats-surplus-summary"
      class="sf-chip green small ml-3"
      variant="tonal"
    >
      {{ surplusCount }} in surplus
    </v-chip>
    <v-chip
      v-if="deficitCount > 0"
      id="stats-deficit-summary"
      class="sf-chip red small"
      :class="{ 'ml-3': surplusCount === 0 }"
      variant="tonal"
    >
      {{ deficitCount }} in deficit
    </v-chip>
    <v-chip
      v-if="balancedCount > 0"
      id="stats-balanced-summary"
      class="sf-chip grey small"
      :class="{ 'ml-3': surplusCount === 0 && deficitCount === 0 }"
      variant="tonal"
    >
      {{ balancedCount }} balanced
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
      <i class="fas fa-info-circle" /> Every item your plan makes or consumes, and whether it has
      any spare. Red needs producing more of, green can be stored or sunk.
    </p>
    <div class="d-flex flex-wrap align-center ga-2 mt-3 mb-3">
      <!-- Each filter wears the colour it selects, so the buttons read as the same language as
           the rows. Unselected is the same colour outlined rather than a neutral grey, which
           would make an unselected Deficit look like a disabled one. The counts follow the
           search, so they say how many match both rather than promising rows the search hides. -->
      <v-btn
        v-for="option in filters"
        :key="option.value"
        :color="option.color"
        size="small"
        :variant="filter === option.value ? 'flat' : 'outlined'"
        @click="filter = option.value"
      >
        {{ option.label }} ({{ option.count }})
      </v-btn>
      <!-- `persistent-clear`: Vuetify otherwise fades the X in on hover or focus only. Type a
           query, click a filter button, and the way to undo the query has disappeared — so pin it
           for as long as the box has text in it. -->
      <v-text-field
        id="stats-items-search"
        v-model="search"
        class="item-search ml-auto"
        clearable
        density="compact"
        hide-details
        persistent-clear
        placeholder="Search items"
        prepend-inner-icon="fas fa-search"
        variant="outlined"
      />
    </div>
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
          <!-- Not "surplus": a chip carries what its factory PRODUCES of the item, or what it is
               short of, so the chips need not sum to Net. `no-margin` is an !important rule that
               beats ml-2, so the gap comes from the container. -->
          <th class="d-flex align-center ga-2">
            Breakdown
            <v-chip class="sf-chip grey x-small no-margin" variant="tonal">produced, or short by</v-chip>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="product in factoryProductDifferences" :key="product.id">
          <td>
            <v-chip class="sf-chip no-margin" :class="chipClass(product.amountRemaining)" variant="tonal">
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
    <!-- Both can be narrowing at once, and blaming the search for a filter's empty result sent
         people back to retype a query that was matching fine. -->
    <p v-else class="text-body-1">
      {{ search && filter !== 'all'
        ? `Nothing matching "${search}" is ${filter}.`
        : (search ? `No items match "${search}".` : 'Nothing to show for this filter.') }}
    </p>
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

  // Every item the plan touches, balanced ones included — this section absorbed the old
  // "Produced Items" list, which showed the same items again with only their supply figure.
  const allItems = computed(() => calculateTotalParts(props.factories))

  // Header at-a-glance counts, shown whether the section is open or collapsed.
  const surplusCount = computed(() => allItems.value.filter(item => item.amountRemaining > 0).length)
  const deficitCount = computed(() => allItems.value.filter(item => item.amountRemaining < 0).length)
  const balancedCount = computed(() => allItems.value.filter(item => item.amountRemaining === 0).length)

  type ItemFilter = 'all' | 'surplus' | 'deficit' | 'balanced'
  const filter = ref<ItemFilter>('all')
  const search = ref('')

  // Punctuation-insensitive, the way the icon picker's search is: the game writes "Mk.5" and
  // nobody types the dot.
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

  const matchesSearch = computed(() => {
    const term = normalise(search.value ?? '')
    if (!term) return () => true
    return (item: { id: string }) => normalise(getPartDisplayName(item.id)).includes(term)
  })

  const searched = computed(() => allItems.value.filter(matchesSearch.value))

  const filters = computed(() => [
    { value: 'all' as const, label: 'All', count: searched.value.length, color: 'primary' },
    { value: 'surplus' as const, label: 'Surplus', count: searched.value.filter(item => item.amountRemaining > 0).length, color: 'success' },
    { value: 'deficit' as const, label: 'Deficit', count: searched.value.filter(item => item.amountRemaining < 0).length, color: 'error' },
    { value: 'balanced' as const, label: 'Balanced', count: searched.value.filter(item => item.amountRemaining === 0).length, color: 'grey' },
  ])

  const factoryProductDifferences = computed(() => {
    if (filter.value === 'surplus') return searched.value.filter(item => item.amountRemaining > 0)
    if (filter.value === 'deficit') return searched.value.filter(item => item.amountRemaining < 0)
    if (filter.value === 'balanced') return searched.value.filter(item => item.amountRemaining === 0)
    return searched.value
  })

  const amountClass = (amount: number) => {
    if (amount > 0) return 'text-success'
    return amount < 0 ? 'text-error' : 'text-medium-emphasis'
  }

  const chipClass = (amount: number) => {
    if (amount > 0) return 'green'
    return amount < 0 ? 'red' : 'grey'
  }

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('statisticsSurplusHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('statisticsSurplusHidden', value.toString())
  })
</script>

<style lang="scss" scoped>
// Wide enough for an item name, and no wider — it shares the row with four filter buttons.
.item-search {
  max-width: 260px;
}

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
