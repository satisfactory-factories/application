<template>
  <draggable v-model="factoriesCopy" class="factory-list" item-key="id" @end="onDragEnd">
    <template #item="{ element }">
      <div :key="element.id" class="mb-1 rounded" :class="factoryClass(element)">
        <v-card
          class="w-100 header list px-0 rounded-0 "
          style="box-shadow: none !important;"
          @click="navigateToFactory(element.id)"
        >
          <v-row class="d-flex flex-nowrap ma-0">
            <v-spacer class="text-body-1 align-content-center pa-2">
              <i class="fas fa-bars text-grey-darken-1 mr-2" />
              <i class="fas fa-industry mr-2" />
              <span>{{ truncateFactoryName(element.name) }}</span>
            </v-spacer>
            <v-tooltip right>
              <template #activator="{ props }">
                <v-col
                  v-if="countIncompleteTasks(element as Factory)"
                  class="text-body-1 align-content-center text-center py-0 px-1 bg-orange-darken-2"
                  cols="auto"
                  v-bind="props"
                  @click="navigateToFactory(element.id, `${element.id}-tasks`)"
                  @click.stop
                >
                  <i class="d-inline fas fa-tasks mr-1" />
                  <span>{{ countIncompleteTasks(element as Factory) }}</span>
                </v-col>
              </template>
              <span>{{ countIncompleteTasks(element as Factory) }} tasks</span>
            </v-tooltip>
            <v-tooltip right>
              <template #activator="{ props }">
                <v-col
                  v-if="element.notes"
                  class="text-body-1 align-content-center text-center py-0 px-1 bg-orange-darken-2"
                  cols="1"
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
                  class="pa-0 align-content-center text-center"
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
    <v-col class="text-center">
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
  import { countIncompleteTasks } from '@/utils/factory-management/factory'
  import draggable from 'vuedraggable'

  const navigateToFactory = inject('navigateToFactory') as (id: number, subsection?: string) => void

  // eslint-disable-next-line func-call-spacing
  const emit = defineEmits<{
    (event: 'createFactory'): void;
    (event: 'updateFactories', factories: Factory[]): void;
  }>()
  const compProps = defineProps<{ factories: Factory[], totalFactories: number }>()
  const factoriesCopy = ref([...compProps.factories])

  watch(() => compProps.factories, factories => {
    factoriesCopy.value = [...factories]
  }, { deep: true })

  const factoryClass = (factory: Factory) => {
    return {
      'factory-card': true,
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
  }
}
</style>
