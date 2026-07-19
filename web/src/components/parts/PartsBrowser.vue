<template>
  <v-card>
    <v-card-title class="py-4">
      <h1 class="text-h4">Parts &amp; Recipes</h1>
    </v-card-title>
    <v-divider />
    <v-card-text>
      <v-text-field
        v-model="searchTerm"
        clearable
        label="Search parts"
        prepend-inner-icon="fas fa-search"
      />
      <div class="mb-4">
        <v-chip
          class="mr-2"
          color="primary"
          prepend-icon="fas fa-industry"
          :variant="showProducedOnly ? 'flat' : 'outlined'"
          @click="showProducedOnly = !showProducedOnly"
        >
          Produced in Plan
        </v-chip>
        <v-chip color="primary" :variant="showFicsmas ? 'flat' : 'outlined'" @click="showFicsmas = !showFicsmas">
          Show FICSMAS
        </v-chip>
      </div>

      <template v-if="debouncedSearchTerm">
        <h2 class="text-h5 mb-2">Parts ({{ filteredParts.length }})</h2>
        <p v-if="!filteredParts.length" class="text-body-2 text-medium-emphasis mb-4">
          No parts match your search.
        </p>
      </template>
      <v-expansion-panels v-model="openPanels" class="mb-6" multiple>
        <part-panel
          v-for="part in filteredParts"
          :key="part.id"
          :part="part"
          :produced-in="producersByPart.get(part.id) ?? []"
        />
      </v-expansion-panels>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import PartPanel from '@/components/parts/PartPanel.vue'
  import { DataInterface } from '@/interfaces/DataInterface'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { buildPartEntries, PartEntry, PartProducer } from '@/utils/parts'
  import { fuzzySearch } from '@/utils/fuzzySearch'
  import { useAppStore } from '@/stores/app-store'

  const props = defineProps<{
    gameData: DataInterface;
  }>()

  const appStore = useAppStore()

  const searchTerm = ref<string>('')
  const showFicsmas = ref<boolean>(false)
  const showProducedOnly = ref<boolean>(false)

  // Debounce the search so the (large) panel list isn't re-rendered on every keystroke.
  const debouncedSearchTerm = ref<string>('')
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  watch(searchTerm, value => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedSearchTerm.value = value ?? ''
    }, 250)
  })

  // Collapse open panels when the result set changes, otherwise Vuetify's group
  // state can leak the "open" state onto a different part after filtering.
  const openPanels = ref<string[]>([])
  watch(debouncedSearchTerm, () => {
    openPanels.value = []
  })

  const allParts = computed<PartEntry[]>(() => buildPartEntries(props.gameData))

  // Kept separate from the search computed so typing doesn't recreate the part objects,
  // which would force every panel to re-render.
  const visibleParts = computed<PartEntry[]>(() => {
    if (showFicsmas.value) {
      return allParts.value
    }

    return allParts.value
      .filter(part => !part.isFicsmas)
      .map(part => ({
        ...part,
        standardRecipes: part.standardRecipes.filter(recipe => !recipe.isFicsmas),
        alternateRecipes: part.alternateRecipes.filter(recipe => !recipe.isFicsmas),
        usedIn: part.usedIn.filter(recipe => !recipe.isFicsmas),
      }))
      .filter(part => part.standardRecipes.length || part.alternateRecipes.length || part.usedIn.length)
  })

  const filteredParts = computed<PartEntry[]>(() => {
    let parts = visibleParts.value

    if (showProducedOnly.value) {
      parts = parts.filter(part => producersByPart.value.get(part.id)?.length)
    }

    return fuzzySearch(debouncedSearchTerm.value, parts, part => part.name)
  })

  // Factories in the current plan producing each part (as a product or byproduct),
  // with the amount of it they produce per minute.
  const producersByPart = computed<Map<string, PartProducer[]>>(() => {
    const producers = new Map<string, PartProducer[]>()
    const addProducer = (part: string, factory: { id: number, name: string, parts: Factory['parts'] }) => {
      const list = producers.get(part) ?? []
      if (!list.some(entry => entry.id === factory.id)) {
        list.push({
          id: factory.id,
          name: factory.name,
          amount: factory.parts[part]?.amountSuppliedViaProduction ?? 0,
        })
        producers.set(part, list)
      }
    }

    appStore.getFactories().forEach(factory => {
      factory.products.forEach(product => addProducer(product.id, factory))
      factory.byProducts.forEach(byProduct => addProducer(byProduct.id, factory))
    })
    return producers
  })
</script>
