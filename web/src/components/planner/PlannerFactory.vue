<template>
  <v-row>
    <v-col>
      <v-card :id="factory.id" :class="factoryClass(factory)">
        <v-row class="header">
          <v-col class="flex-grow-1" cols="auto" md="8">
            <div class="text-h4 text-md-h5">
              <i class="fas fa-industry" />
              <input
                v-model="factory.name"
                class="ml-3 pl-0 factory-name"
                placeholder="Factory Name"
              >
            </div>
            <!-- chips bar -->
            <div class="d-flex align-center mt-1">
              <!-- tasks chip -->
              <div v-if="countActiveTasks(factory)" class="mr-2">
                <v-chip class="sf-chip small yellow no-margin" @click="navigateToFactory(factory.id, `${factory.id}-tasks`)">
                  <i class="fas fa-tasks" />
                  <span class="ml-2">Tasks: {{ countActiveTasks(factory) }}</span>
                </v-chip>
              </div>
              <!-- notes chip -->
              <div v-if="factory.notes" class="mr-2">
                <v-chip class="sf-chip small yellow no-margin" @click="navigateToFactory(factory.id, `${factory.id}-notes`)">
                  <i class="fas fa-sticky-note" />
                  <span class="ml-2">See notes</span>
                </v-chip>
              </div>
              <!-- sync status chip -->
              <div v-if="factory.inSync">
                <v-chip class="sf-chip small green no-margin" @click="setSyncState(factory)">
                  <i class="fas fa-check-square" />
                  <span class="ml-2">In sync with game</span>
                  <v-btn
                    class="ml-2"
                    icon
                    size="x-small"
                    title="Reset sync status"
                    @click.stop="resetSyncState(factory)"
                  >
                    <i class="fas fa-times" />
                  </v-btn>
                </v-chip>
              </div>
              <div v-if="factory.inSync === false">
                <v-chip class="sf-chip small orange no-margin" @click="setSyncState(factory)">
                  <i class="fas fa-times-square" />
                  <span class="ml-2">Out of sync with game</span>
                  <v-btn
                    class="ml-2"
                    icon
                    size="x-small"
                    title="Reset sync status"
                    @click.stop="resetSyncState(factory)"
                  >
                    <i class="fas fa-times" />
                  </v-btn>
                </v-chip>
              </div>
              <div v-if="factory.inSync === null">
                <v-chip class="border border-gray border-dashed" :disabled="!validForGameSync(factory)" @click="setSyncState(factory)">
                  <i class="fas fa-question" />
                  <span class="ml-2">Mark as in sync with game</span>
                </v-chip>
              </div>
              <!-- sync status tooltip -->
              <tooltip-info text="Game Sync is when you have implemented the factory inside the game.<br> When it drops out of sync, there are changes that you need to implement.<br> When a factory's products are changed, the factory will be out of sync, or if you set it manually." />
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
        <v-card-text v-if="!factory.hidden">
          <products-and-power
            :factory="factory"
            :help-text="helpText"
          />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <factory-imports
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
              <planner-factory-tasks
                :id="`${factory.id}-tasks`"
                :factory="factory"
                :help-text="helpText"
              />
            </v-col>
            <v-col cols="12" md="6">
              <planner-factory-notes
                :id="`${factory.id}-notes`"
                :factory="factory"
                :help-text="helpText"
              />
            </v-col>
          </v-row>
        </v-card-text>

        <!-- Hidden factory collapse -->

        <v-card-text v-if="factory.hidden" class="pa-0">
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
                      clickable
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
                    clickable
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
              <template v-for="part in factory.products">
                <v-chip
                  v-if="factory.parts[part.id]"
                  :key="`${factory.id}-${part.id}`"
                  class="sf-chip"
                  :class="factory.parts[part.id].amountRemaining < 0 ? 'red' : ''"
                >
                  <span class="mr-2">
                    <game-asset
                      v-if="part.id"
                      clickable
                      :subject="part.id"
                      type="item"
                    />
                  </span>
                  <span>
                    <b>{{ getPartDisplayName(part.id) }}</b>: {{ formatNumber(part.amount) }}/min
                  </span>
                  <span
                    v-if="factory.parts[part.id].amountRemaining !== 0"
                    class="ml-2"
                    :class="differenceClass(factory.parts[part.id].amountRemaining)"
                  >
                    (<span v-if="factory.parts[part.id].amountRemaining > 0">+</span>{{ formatNumber(factory.parts[part.id].amountRemaining) }}/min)</span>
                </v-chip>
              </template>
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
                    clickable
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
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { differenceClass, getPartDisplayName } from '@/utils/helpers'
  import { countActiveTasks } from '@/utils/factory-management/factory'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useDisplay } from 'vuetify'
  import { setSyncState } from '@/utils/factory-management/syncState'

  const findFactory = inject('findFactory') as (id: string | number) => Factory
  const copyFactory = inject('copyFactory') as (factory: Factory) => void
  const deleteFactory = inject('deleteFactory') as (factory: Factory) => void
  const moveFactory = inject('moveFactory') as (factory: Factory, direction: string) => void
  const navigateToFactory = inject('navigateToFactory') as (id: string | number, subsection?: string) => void

  defineProps<{
    factory: Factory
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

  const hasExports = (factory: Factory) => {
    if (!factory.dependencies?.requests) return false
    return Object.keys(factory.dependencies.requests).length > 0
  }

  const validForGameSync = (factory: Factory): boolean => {
    return (factory.products.length > 0 && factory.products[0]?.recipe !== '') ||
      (factory.powerProducers.length > 0 && factory.powerProducers[0]?.building !== '')
  }

  const resetSyncState = (factory: Factory) => {
    factory.inSync = null
  }
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
