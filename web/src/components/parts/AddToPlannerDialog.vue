<template>
  <v-dialog v-model="isOpen" max-width="600">
    <v-card>
      <v-card-title class="text-h6 py-4">
        Add "{{ recipe.displayName }}" to a factory
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-0">
        <v-list v-if="factories.length">
          <v-list-item
            v-for="factory in factories"
            :key="factory.id"
            :active="factoryUsage(factory) !== null"
            color="primary"
          >
            <template #prepend>
              <i class="fas fa-industry mr-3" />
            </template>
            <v-list-item-title>
              {{ factory.name }}
              <v-chip
                v-if="factoryUsage(factory) === 'produces'"
                class="ml-2"
                color="green"
                size="small"
                variant="tonal"
              >
                Produces this
              </v-chip>
              <v-chip
                v-else-if="factoryUsage(factory) === 'uses'"
                class="ml-2"
                color="blue"
                size="small"
                variant="tonal"
              >
                Uses this
              </v-chip>
            </v-list-item-title>
            <template #append>
              <v-btn
                color="primary"
                :disabled="adding !== null && adding !== factory.id"
                icon="fas fa-plus"
                :loading="adding === factory.id"
                size="small"
                :title="`Add to ${factory.name}`"
                variant="tonal"
                @click="addToFactory(factory)"
              />
            </template>
          </v-list-item>
        </v-list>
        <p v-else class="text-body-2 text-medium-emphasis pa-4">
          You don't have any factories yet. Create one below!
        </p>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn
          color="primary"
          :disabled="adding !== null && adding !== 'new'"
          :loading="adding === 'new'"
          prepend-icon="fas fa-plus"
          variant="tonal"
          @click="addToNewFactory"
        >
          Add to new factory
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">
          Close
        </v-btn>
        <v-btn
          color="green"
          prepend-icon="fas fa-ruler-triangle"
          variant="flat"
          @click="goToPlanner"
        >
          Go to Planner
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { Recipe } from '@/interfaces/Recipes'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { getPartDisplayName } from '@/utils/helpers'
  import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
  import { addProductToFactory } from '@/utils/factory-management/products'
  import { useAppStore } from '@/stores/app-store'
  import { useGameDataStore } from '@/stores/game-data-store'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{
    recipe: Recipe;
  }>()

  const isOpen = defineModel<boolean>({ required: true })

  const router = useRouter()
  const appStore = useAppStore()
  const gameDataStore = useGameDataStore()

  const factories = computed(() => appStore.getFactories())

  const primaryPart = computed(() => {
    const primaryProduct = props.recipe.products.find(product => !product.isByProduct) ?? props.recipe.products[0]
    return primaryProduct.part
  })

  // Whether the factory already produces or consumes the recipe's product.
  const factoryUsage = (factory: Factory): 'produces' | 'uses' | null => {
    const part = primaryPart.value
    if (factory.products.some(product => product.id === part) || factory.byProducts.some(byProduct => byProduct.id === part)) {
      return 'produces'
    }
    if (factory.parts[part]?.amountRequired) {
      return 'uses'
    }
    return null
  }

  // Adds the recipe's product at the default amount (1 building @ 100% clock).
  const addRecipeProduct = (factory: Factory) => {
    const primaryProduct = props.recipe.products.find(product => !product.isByProduct) ?? props.recipe.products[0]

    addProductToFactory(factory, {
      id: primaryProduct.part,
      recipe: props.recipe.id,
      amount: primaryProduct.perMin,
    })
  }

  // The add itself is synchronous and can take a while on big plans (calculateFactories
  // recalculates everything), so show a spinner and yield a frame first so it can paint.
  const adding = ref<number | 'new' | null>(null)
  const runAdd = async (key: number | 'new', work: () => void) => {
    if (adding.value !== null) {
      return
    }
    adding.value = key
    await new Promise(resolve => setTimeout(resolve, 50))
    try {
      work()
    } finally {
      adding.value = null
    }
  }

  const addToFactory = (factory: Factory) => {
    runAdd(factory.id, () => {
      addRecipeProduct(factory)
      calculateFactories(appStore.getFactories(), gameDataStore.getGameData())
      eventBus.emit('toast', { message: `Added "${props.recipe.displayName}" to ${factory.name}!` })
    })
  }

  const addToNewFactory = () => {
    runAdd('new', () => {
      const primaryProduct = props.recipe.products.find(product => !product.isByProduct) ?? props.recipe.products[0]
      const factory = newFactory(`${getPartDisplayName(primaryProduct.part)} Factory`)

      addRecipeProduct(factory)
      appStore.addFactory(factory)
      calculateFactories(appStore.getFactories(), gameDataStore.getGameData())
      eventBus.emit('toast', { message: `Created "${factory.name}" with "${props.recipe.displayName}"!` })
    })
  }

  const goToPlanner = () => {
    isOpen.value = false
    router.push('/')
  }
</script>
