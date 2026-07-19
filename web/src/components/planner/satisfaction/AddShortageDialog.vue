<template>
  <v-dialog v-model="isOpen" max-width="600">
    <v-card>
      <v-card-title class="text-h6 py-4">
        Add "{{ getPartDisplayName(partId) }}" production to a factory
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-0">
        <v-list v-if="selectableFactories.length">
          <v-list-item
            v-for="targetFactory in selectableFactories"
            :key="targetFactory.id"
            :active="producesPart(targetFactory)"
            color="primary"
          >
            <template #prepend>
              <i class="fas fa-industry mr-3" />
            </template>
            <v-list-item-title>
              {{ targetFactory.name }}
              <v-chip
                v-if="producesPart(targetFactory)"
                class="ml-2"
                color="green"
                size="small"
                variant="tonal"
              >
                Produces this
              </v-chip>
            </v-list-item-title>
            <template #append>
              <v-btn
                color="primary"
                :disabled="addingFactoryId !== null"
                size="small"
                :title="`Add to ${targetFactory.name}`"
                variant="tonal"
                @click="addToFactory(targetFactory)"
              >
                <template v-if="addingFactoryId === targetFactory.id">
                  <v-progress-circular class="mr-1" indeterminate size="14" width="2" />
                  <span>Adding...</span>
                </template>
                <template v-else>
                  <i class="fas fa-plus" /><span class="ml-1">Add</span>
                </template>
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <p v-else class="text-body-2 text-medium-emphasis pa-4">
          You don't have any other factories to add this to. Use the "New Factory" button instead.
        </p>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-checkbox
          v-model="jumpToFactory"
          density="compact"
          hide-details
          label="Jump to factory after adding"
        />
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, inject, nextTick, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { getPartDisplayName } from '@/utils/helpers'
  import { calculateFactories } from '@/utils/factory-management/factory'
  import { addShortageToFactory } from '@/utils/factory-management/satisfaction'
  import { getProduct } from '@/utils/factory-management/products'
  import { useAppStore } from '@/stores/app-store'
  import { useGameDataStore } from '@/stores/game-data-store'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{
    factory: Factory; // The factory with the shortage
    partId: string;
  }>()

  const isOpen = defineModel<boolean>({ required: true })

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  const appStore = useAppStore()
  const gameDataStore = useGameDataStore()
  const { getDefaultRecipeForPart } = gameDataStore

  // Computed from the store so newly created factories always show up when the dialog opens.
  const selectableFactories = computed(() =>
    appStore.getFactories().filter(fac => fac.id !== props.factory.id)
  )

  const jumpToFactory = ref(localStorage.getItem('shortageJumpToFactory') !== 'false')
  watch(jumpToFactory, value => {
    localStorage.setItem('shortageJumpToFactory', JSON.stringify(value))
  })

  const addingFactoryId = ref<number | null>(null)

  const producesPart = (factory: Factory) => {
    return !!getProduct(factory, props.partId, true)
  }

  const addToFactory = async (targetFactory: Factory) => {
    if (addingFactoryId.value !== null) return
    addingFactoryId.value = targetFactory.id

    // Let the browser paint the "Adding..." button state before the synchronous recalculation blocks the thread.
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      addShortageToFactory(props.factory, targetFactory, props.partId, getDefaultRecipeForPart(props.partId))
      calculateFactories(appStore.getFactories(), gameDataStore.getGameData())
      eventBus.emit('toast', { message: `Added "${getPartDisplayName(props.partId)}" production to ${targetFactory.name}!` })
    } finally {
      addingFactoryId.value = null
    }

    isOpen.value = false

    if (jumpToFactory.value) {
      // Ensure the recalculated DOM has settled before scrolling to the factory.
      await nextTick()
      navigateToFactory(targetFactory.id)
    }
  }
</script>
