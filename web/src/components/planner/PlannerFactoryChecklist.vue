<template>
  <v-card class="factory-card sub-card">
    <v-row class="header">
      <v-col class="text-h5 flex-grow-1 d-flex align-center flex-wrap ga-2" cols="8">
        <div>
          <i class="fas fa-check-square" /><span class="ml-3">Checklist</span>
        </div>
        <v-chip class="sf-chip small no-margin" :class="checklistChipClass(factory)">
          {{ completedCount }}/{{ totalCount }}
          {{ desyncs.length > 0 ? `ticked, ${desyncs.length} to reconfirm` : 'complete' }}
        </v-chip>
      </v-col>
      <v-col class="text-right" cols="4">
        <v-btn
          v-show="!factory.checklistPanelHidden"
          color="primary"
          prepend-icon="fas fa-eye-slash"
          variant="flat"
          @click="setChecklistPanelHidden(factory, true)"
        >Hide
        </v-btn>
        <v-btn
          v-show="factory.checklistPanelHidden"
          color="primary"
          prepend-icon="fas fa-eye"
          variant="outlined"
          @click="setChecklistPanelHidden(factory, false)"
        >Show
        </v-btn>
      </v-col>
    </v-row>
    <v-card-text v-if="!factory.checklistPanelHidden" class="text-body-1">
      <!-- The one place that says what to DO about a desync. The per-row chips below say what
           changed on each row; this says why the factory is amber at all, and offers the bulk
           acknowledgement for the common case of "I already rebuilt the lot". -->
      <div v-if="desyncs.length > 0" class="desync-banner mb-4">
        <div class="d-flex align-center flex-wrap ga-2">
          <i class="fas fa-exclamation-triangle" />
          <span>
            <b>{{ desyncs.length }}</b>
            {{ desyncs.length === 1 ? 'ticked item has' : 'ticked items have' }}
            changed since you marked
            {{ desyncs.length === 1 ? 'it' : 'them' }} as built.
          </span>
          <v-btn
            class="ml-auto"
            color="primary"
            prepend-icon="fas fa-check-double"
            size="small"
            variant="flat"
            @click="acknowledgeChecklistDesyncs(factory)"
          >Reconfirm all
          </v-btn>
        </div>
        <p class="text-body-2 mt-2 mb-0">
          Each one is flagged below with the number it was ticked at and the number the plan asks
          for now. Build the difference and reconfirm it, or change the plan back to match what you
          have already built.
        </p>
      </div>
      <p v-if="totalCount === 0" class="text-body-2">
        Nothing to check off yet: add products, power producers, imports or exports to this factory.
      </p>
      <template v-else>
        <div v-if="factory.products.length > 0" class="checklist-group">
          <p class="checklist-group-title">Products</p>
          <div v-for="product in factory.products" :key="product.id" class="checklist-row">
            <input
              :key="`${product.id}-${!!product.completed}`"
              :checked="!!product.completed"
              class="checklist-tick"
              :class="{ desynced: isProductChecklistDesynced(product) }"
              title="Mark as built"
              type="checkbox"
              @click.prevent="toggleChecklistProduct(factory, product)"
            >
            <game-asset
              v-if="product.id"
              clickable
              height="24"
              :subject="product.id"
              type="item"
              width="24"
            />
            <span class="ml-2">{{ getPartDisplayName(product.id) }}</span>
            <checklist-desync-chip
              v-if="productChecklistDesync(product)"
              :desync="productChecklistDesync(product)!"
              @acknowledge="toggleChecklistProduct(factory, product)"
            />
          </div>
        </div>
        <div v-if="factory.powerProducers.length > 0" class="checklist-group">
          <p class="checklist-group-title">Power</p>
          <div v-for="(producer, producerIndex) in factory.powerProducers" :key="producerIndex" class="checklist-row">
            <input
              :key="`${producerIndex}-${!!producer.completed}`"
              :checked="!!producer.completed"
              class="checklist-tick"
              :class="{ desynced: isPowerProducerChecklistDesynced(producer) }"
              title="Mark as built"
              type="checkbox"
              @click.prevent="toggleChecklistPowerProducer(factory, producer)"
            >
            <game-asset
              v-if="producer.building"
              clickable
              height="24"
              :subject="producer.building"
              type="building"
              width="24"
            />
            <span class="ml-2">{{ getPowerProducerDisplayName(producer) }}</span>
            <checklist-desync-chip
              v-if="powerProducerChecklistDesync(producer)"
              :desync="powerProducerChecklistDesync(producer)!"
              @acknowledge="toggleChecklistPowerProducer(factory, producer)"
            />
          </div>
        </div>
        <div v-if="factory.inputs.length > 0" class="checklist-group">
          <p class="checklist-group-title">Imports</p>
          <div v-for="(input, inputIndex) in factory.inputs" :key="inputIndex" class="checklist-row">
            <input
              :key="`${inputIndex}-${!!input.completed}`"
              :checked="!!input.completed"
              class="checklist-tick"
              :class="{ desynced: isInputChecklistDesynced(input) }"
              title="Mark as built"
              type="checkbox"
              @click.prevent="toggleChecklistInput(factory, input)"
            >
            <game-asset
              v-if="input.outputPart"
              clickable
              height="24"
              :subject="input.outputPart"
              type="item"
              width="24"
            />
            <span class="ml-2">{{ getPartDisplayName(input.outputPart ?? '') }}</span>
            <v-chip
              v-if="input.factoryId"
              class="sf-chip sf-chip-clickable small factory"
              @click="navigateToFactory(input.factoryId)"
            >
              <factory-icon-display :icon="findFactory(input.factoryId).icon" size="20" />
              <span class="ml-2">{{ findFactory(input.factoryId).name }}</span>
              <v-btn
                class="chip-jump-btn ml-2"
                color="primary"
                icon="fas fa-eye"
                size="x-small"
                title="Jump to this factory"
                variant="flat"
                @click.stop="navigateToFactory(input.factoryId)"
              />
            </v-chip>
            <checklist-desync-chip
              v-if="inputChecklistDesync(input)"
              :desync="inputChecklistDesync(input)!"
              @acknowledge="toggleChecklistInput(factory, input)"
            />
          </div>
        </div>
        <div v-if="exportRequests.length > 0" class="checklist-group">
          <p class="checklist-group-title">Exports</p>
          <div
            v-for="request in exportRequests"
            :key="`${request.requestingFactoryId}-${request.part}`"
            class="checklist-row"
          >
            <input
              :key="`${request.requestingFactoryId}-${request.part}-${isChecklistExportComplete(factory, request.requestingFactoryId, request.part)}`"
              :checked="isChecklistExportComplete(factory, request.requestingFactoryId, request.part)"
              class="checklist-tick"
              :class="{ desynced: isChecklistExportDesynced(factory, request.requestingFactoryId, request.part, request.amount) }"
              title="Mark as built"
              type="checkbox"
              @click.prevent="toggleChecklistExport(factory, request.requestingFactoryId, request.part, request.amount)"
            >
            <game-asset
              clickable
              height="24"
              :subject="request.part"
              type="item"
              width="24"
            />
            <span class="ml-2">{{ getPartDisplayName(request.part) }}</span>
            <v-chip
              class="sf-chip sf-chip-clickable small factory"
              @click="navigateToFactory(request.requestingFactoryId)"
            >
              <factory-icon-display :icon="findFactory(request.requestingFactoryId).icon" size="20" />
              <span class="ml-2">{{ findFactory(request.requestingFactoryId).name }}</span>
              <v-btn
                class="chip-jump-btn ml-2"
                color="primary"
                icon="fas fa-eye"
                size="x-small"
                title="Jump to this factory"
                variant="flat"
                @click.stop="navigateToFactory(request.requestingFactoryId)"
              />
            </v-chip>
            <checklist-desync-chip
              v-if="checklistExportDesync(factory, request.requestingFactoryId, request.part, request.amount)"
              :desync="checklistExportDesync(factory, request.requestingFactoryId, request.part, request.amount)!"
              @acknowledge="toggleChecklistExport(factory, request.requestingFactoryId, request.part, request.amount)"
            />
          </div>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { computed, inject } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { getPartDisplayName } from '@/utils/helpers'
  import { getPowerProducerDisplayName } from '@/utils/factory-management/common'
  import { getRequestsForFactory } from '@/utils/factory-management/exports'
  import {
    acknowledgeChecklistDesyncs,
    checklistChipClass,
    checklistExportDesync,
    countChecklistCompleted,
    countChecklistTotal,
    inputChecklistDesync,
    isChecklistExportComplete,
    isChecklistExportDesynced,
    isInputChecklistDesynced,
    isPowerProducerChecklistDesynced,
    isProductChecklistDesynced,
    listChecklistDesyncs,
    powerProducerChecklistDesync,
    productChecklistDesync,
    setChecklistPanelHidden,
    toggleChecklistExport,
    toggleChecklistInput,
    toggleChecklistPowerProducer,
    toggleChecklistProduct,
  } from '@/utils/factory-management/checklist'

  const props = defineProps<{
    factory: Factory
  }>()

  const findFactory = inject('findFactory') as (id: string | number) => Factory
  const navigateToFactory = inject('navigateToFactory') as (
    id: string | number,
    subsection?: string,
    fallback?: string,
  ) => void

  const totalCount = computed(() => countChecklistTotal(props.factory))
  const completedCount = computed(() => countChecklistCompleted(props.factory))
  const exportRequests = computed(() => getRequestsForFactory(props.factory))
  const desyncs = computed(() => listChecklistDesyncs(props.factory))
</script>

<style lang="scss" scoped>
// Amber card rather than a chip: it holds a sentence, a paragraph and a button, and reads as the
// panel's own state instead of one more label in the row of them above.
.desync-banner {
  background-color: var(--sf-status-warning-bg);
  border: 1px solid var(--sf-status-warning-border);
  border-radius: 4px;
  padding: 12px;

  > div > i {
    color: var(--sf-status-warning);
  }
}

.checklist-group {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.checklist-group-title {
  font-weight: bold;
  margin-bottom: 8px;
}

.checklist-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
  gap: 8px;
}

// Sits inside the factory chip, so it has to shed the icon button's circle and claw back the
// chip's right padding to avoid looking bolted on. Mirrors .chip-jump-btn in
// PlannerFactorySatisfactionItems.vue, which the export chip here is styled after.
.chip-jump-btn {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 4px !important;
  margin-right: -4px;
}

// Box and tick are drawn in CSS on a native checkbox. Vuetify's selection controls point their
// icons at Font Awesome Regular, which this app doesn't ship: the unticked box renders as
// nothing at all. See PlannerFactoryTasks.vue's .task-tick, which this mirrors.
.checklist-tick {
  appearance: none;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-radius: 3px;
  cursor: pointer;
  display: block;
  height: 18px;
  margin: 0;
  position: relative;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  width: 18px;
  flex-shrink: 0;

  &:checked {
    background-color: var(--sf-success);
    border-color: var(--sf-success);
  }

  &:checked::after {
    border: solid #fff;
    border-width: 0 2px 2px 0;
    content: '';
    height: 10px;
    left: 4px;
    position: absolute;
    top: 0;
    transform: rotate(45deg);
    width: 5px;
  }

  // Desynced: still checked, but the plan's number for this item moved since it was ticked.
  // Amber rather than red — the tick stays applied, this only flags it may be stale. Plain, with
  // no glyph of its own: the row's adjoining "Desynced" chip already carries that meaning, and a
  // second symbol crammed into an 18px box read worse than the empty box does.
  &.desynced:checked {
    background-color: var(--sf-status-warning-border);
    border-color: var(--sf-status-warning-border);

    &::after {
      content: none;
    }
  }
}
</style>
