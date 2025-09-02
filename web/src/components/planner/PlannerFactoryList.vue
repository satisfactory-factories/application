<template>
  <draggable
    v-show="show"
    v-model="factoriesCopy"
    class="factory-list"
    item-key="id"
    @end="onDragEnd"
  >
    <template #item="{ element }">
      <div :key="element.id" class="mb-1 rounded" :class="factoryClass(element)">
        <v-card
          class="w-100 header list px-0 rounded-0 "
          style="box-shadow: none !important;"
          @click="navigateToFactory(element.id)"
        >
          <v-row class="d-flex flex-nowrap ma-0">
            <v-spacer class="d-flex align-center text-body-1 pa-2">
              <i class="fas fa-bars text-grey-darken-1 mr-2" />
              <i class="fas fa-industry mr-2" />
              <span>{{ truncateFactoryName(element.name) }}</span>
            </v-spacer>
            <v-tooltip right>
              <template #activator="{ props }">
                <v-col
                  v-if="countActiveTasks(element as Factory)"
                  class="context-icon align-content-center text-center py-0 px-1"
                  cols="auto"
                  v-bind="props"
                  @click="navigateToFactory(element.id, `${element.id}-tasks`)"
                  @click.stop
                >
                  <i class="d-inline fas fa-tasks mr-1" />
                  <span>{{ countActiveTasks(element as Factory) }}</span>
                </v-col>
              </template>
              <span>Tasks: {{ countActiveTasks(element as Factory) }}</span>
            </v-tooltip>
            <v-tooltip right>
              <template #activator="{ props }">
                <v-col
                  v-if="element.notes"
                  class="context-icon align-content-center text-center py-0 px-1"
                  cols="auto"
                  v-bind="props"
                  @click="navigateToFactory(element.id, `${element.id}-notes`)"
                  @click.stop
                >
                  <i class="d-inline fas fa-sticky-note" />
                </v-col>
              </template>
              <span>See notes</span>
            </v-tooltip>
            <v-tooltip right>
              <template #activator="{ props }">
                <v-col
                  class="pa-0 ml-2 align-content-center text-center"
                  :class="syncStateClass(element)"
                  cols="1"
                  v-bind="props"
                >
                  <div v-if="element.inSync" class="d-inline">
                    <i class="fas fa-check" />
                  </div>
                  <div v-if="element.inSync === false" class="d-inline">
                    <i class="fas fa-times" />
                  </div>
                  <div v-if="element.inSync === null" class="d-inline">
                    <i class="fas fa-question" />
                  </div>
                </v-col>
              </template>
              <span>
                {{ element.inSync === true
                  ? 'In sync with game'
                  : element.inSync === false
                    ? 'Out of sync with game'
                    : 'Game sync unknown'
                }}
              </span>
            </v-tooltip>
          </v-row>
        </v-card>
      </div>
    </template>
  </draggable>
  <v-row class="pa-0 ma-0">
    <v-col class="text-center" :class="factories.length === 0 ? 'pt-0' : 'pt-n1'">
      <v-btn
        color="primary"
        prepend-icon="fas fa-plus"
        ripple
        @click="createFactory"
      >
        Add Factory
      </v-btn>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { defineEmits, defineProps, inject, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { countActiveTasks } from '@/utils/factory-management/factory'
  import draggable from 'vuedraggable'
  import eventBus from '@/utils/eventBus'
  import { useAppStore } from '@/stores/app-store'

  const { getActiveFactoryId } = useAppStore()
  const navigateToFactory = inject('navigateToFactory') as (id: number, subsection?: string) => void

  // eslint-disable-next-line func-call-spacing
  const emit = defineEmits<{
    (event: 'createFactory'): void;
    (event: 'updateFactories', factories: Factory[]): void;
  }>()
  const compProps = defineProps<{
    factories: Factory[],
    totalFactories: number,
    loadedFrom: string
  }>()
  const show = ref(compProps.loadedFrom !== 'planner')

  const factoriesCopy = ref([...compProps.factories])

  watch(() => compProps.factories, factories => {
    factoriesCopy.value = [...factories]
  }, { deep: true })

  // "Cheat" here by when a load is requested we hide the list
  eventBus.on('prepareForLoad', () => {
    show.value = false
  })

  eventBus.on('incrementLoad', () => {
    show.value = true
  })

  const factoryClass = (factory: Factory) => {
    return {
      'factory-card': true,
      'active-factory': getActiveFactoryId() === factory.id,
      problem: factory.hasProblem,
      needsSync: !factory.hasProblem && factory.inSync === false,
    }
  }

  const createFactory = () => {
    emit('createFactory')
  }

  const truncateFactoryName = (name: string, limit: number = 24) => {
    return name.length > limit ? name.substring(0, limit) + '...' : name
  }

  const onDragEnd = () => {
    emit('updateFactories', factoriesCopy.value)
  }

  const syncStateClass = (factory: Factory) => {
    return {
      'bg-green-darken-2': factory.inSync,
      'bg-orange-darken-2': factory.inSync === false,
      'bg-grey-darken-2': factory.inSync === null,
    }
  }
</script>

<style lang="scss" scoped>
.factory-list {
  display: flex;
  flex-direction: column;

  .factory-card {
    .header {
      border-bottom: 0 !important;
    }

    &.active-factory {
      .header {
        background-color: rgba(33, 150, 243, 0.15) !important;
        border-left: 4px solid #2196F3 !important;
      }
    }
  }
}

.context-icon {
  color: #757575;
  transition: color 0.3s;
  &:hover {
    color: white;
  }
}

.pt-n1 {
  margin-top: -0.25rem !important;
}
</style>
