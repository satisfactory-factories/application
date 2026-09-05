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
      <!-- Products / Imports / Exports sit side by side rather than stacked: the checklist is a
           build-along reference, and three short tables read far better than one column tall
           enough to scroll past. Columns that have nothing in them are dropped entirely and the
           remainder share the width, so a products-only factory doesn't render two empty boxes. -->
      <div v-else class="checklist-columns">
        <div v-if="hasBuildColumn" class="checklist-column">
          <div v-if="factory.products.length > 0" class="checklist-group">
            <p class="checklist-group-title">Products</p>
            <v-table class="checklist-table" density="compact">
              <thead>
                <tr>
                  <th class="tick-col" />
                  <th>Item</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="product in factory.products" :key="product.id" class="checklist-row">
                  <td class="tick-col">
                    <input
                      :key="`${product.id}-${!!product.completed}`"
                      :checked="!!product.completed"
                      class="checklist-tick"
                      :class="{ desynced: isProductChecklistDesynced(product) }"
                      title="Mark as built"
                      type="checkbox"
                      @click.prevent="toggleChecklistProduct(factory, product)"
                    >
                  </td>
                  <td class="item-cell">
                    <div class="item-inner">
                      <game-asset
                        v-if="product.id"
                        clickable
                        height="24"
                        :subject="product.id"
                        type="item"
                        width="24"
                      />
                      <span>{{ getPartDisplayName(product.id) }}</span>
                      <checklist-desync-chip
                        v-if="productChecklistDesync(product)"
                        :desync="productChecklistDesync(product)!"
                        @acknowledge="toggleChecklistProduct(factory, product)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
          <div v-if="factory.powerProducers.length > 0" class="checklist-group">
            <p class="checklist-group-title">Power</p>
            <v-table class="checklist-table" density="compact">
              <thead>
                <tr>
                  <th class="tick-col" />
                  <th>Building</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(producer, producerIndex) in factory.powerProducers" :key="producerIndex" class="checklist-row">
                  <td class="tick-col">
                    <input
                      :key="`${producerIndex}-${!!producer.completed}`"
                      :checked="!!producer.completed"
                      class="checklist-tick"
                      :class="{ desynced: isPowerProducerChecklistDesynced(producer) }"
                      title="Mark as built"
                      type="checkbox"
                      @click.prevent="toggleChecklistPowerProducer(factory, producer)"
                    >
                  </td>
                  <td class="item-cell">
                    <div class="item-inner">
                      <game-asset
                        v-if="producer.building"
                        clickable
                        height="24"
                        :subject="producer.building"
                        type="building"
                        width="24"
                      />
                      <span>{{ getPowerProducerDisplayName(producer) }}</span>
                      <checklist-desync-chip
                        v-if="powerProducerChecklistDesync(producer)"
                        :desync="powerProducerChecklistDesync(producer)!"
                        @acknowledge="toggleChecklistPowerProducer(factory, producer)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </div>
        <!-- Imports and exports are grouped by part, one tick per source/destination factory
             inside the row. A factory buying four parts off the same neighbour used to repeat
             both names four times over; the item is now named once and the factories hang off it. -->
        <div v-if="importGroups.length > 0" class="checklist-column">
          <div class="checklist-group">
            <p class="checklist-group-title">Imports</p>
            <v-table class="checklist-table" density="compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="group in importGroups" :key="group.part" class="checklist-row">
                  <td class="item-cell">
                    <div class="item-inner">
                      <game-asset
                        v-if="group.part"
                        clickable
                        height="24"
                        :subject="group.part"
                        type="item"
                        width="24"
                      />
                      <span>{{ getPartDisplayName(group.part) }}</span>
                    </div>
                  </td>
                  <td class="source-col">
                    <div
                      v-for="entry in group.entries"
                      :key="entry.index"
                      class="checklist-source"
                    >
                      <input
                        :key="`${entry.index}-${!!entry.input.completed}`"
                        :checked="!!entry.input.completed"
                        class="checklist-tick"
                        :class="{ desynced: isInputChecklistDesynced(entry.input) }"
                        title="Mark as built"
                        type="checkbox"
                        @click.prevent="toggleChecklistInput(factory, entry.input)"
                      >
                      <v-chip
                        v-if="entry.input.factoryId"
                        class="sf-chip sf-chip-clickable small factory"
                        @click="navigateToFactory(entry.input.factoryId)"
                      >
                        <factory-icon-display :icon="findFactory(entry.input.factoryId).icon" size="20" />
                        <span class="ml-2">{{ findFactory(entry.input.factoryId).name }}</span>
                        <v-btn
                          class="chip-jump-btn ml-2"
                          color="primary"
                          icon="fas fa-eye"
                          size="x-small"
                          title="Jump to this factory"
                          variant="flat"
                          @click.stop="navigateToFactory(entry.input.factoryId)"
                        />
                      </v-chip>
                      <span v-else class="text-body-2 text-medium-emphasis">No factory selected</span>
                      <checklist-desync-chip
                        v-if="inputChecklistDesync(entry.input)"
                        :desync="inputChecklistDesync(entry.input)!"
                        @acknowledge="toggleChecklistInput(factory, entry.input)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </div>
        <div v-if="exportGroups.length > 0" class="checklist-column">
          <div class="checklist-group">
            <p class="checklist-group-title">Exports</p>
            <v-table class="checklist-table" density="compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="group in exportGroups" :key="group.part" class="checklist-row">
                  <td class="item-cell">
                    <div class="item-inner">
                      <game-asset
                        clickable
                        height="24"
                        :subject="group.part"
                        type="item"
                        width="24"
                      />
                      <span>{{ getPartDisplayName(group.part) }}</span>
                    </div>
                  </td>
                  <td class="source-col">
                    <div
                      v-for="request in group.requests"
                      :key="request.requestingFactoryId"
                      class="checklist-source"
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
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { computed, inject } from 'vue'
  import { Factory, FactoryDependencyRequest, FactoryInput } from '@/interfaces/planner/FactoryInterface'
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
  const desyncs = computed(() => listChecklistDesyncs(props.factory))

  // The input's index in factory.inputs travels with it: it is what keys the tick, and a tick
  // keyed on anything that can repeat (the part, the source factory) is a tick that can be
  // patched onto the wrong row. See checklist-reactivity.spec.ts for why the key matters at all.
  interface ImportEntry {
    index: number
    input: FactoryInput
  }

  const importGroups = computed<{ part: string, entries: ImportEntry[] }[]>(() => {
    const groups = new Map<string, ImportEntry[]>()
    props.factory.inputs.forEach((input, index) => {
      const part = input.outputPart ?? ''
      const entries = groups.get(part) ?? []
      entries.push({ index, input })
      groups.set(part, entries)
    })
    return [...groups.entries()].map(([part, entries]) => ({ part, entries }))
  })

  const exportGroups = computed<{ part: string, requests: FactoryDependencyRequest[] }[]>(() => {
    const groups = new Map<string, FactoryDependencyRequest[]>()
    getRequestsForFactory(props.factory).forEach(request => {
      const requests = groups.get(request.part) ?? []
      requests.push(request)
      groups.set(request.part, requests)
    })
    return [...groups.entries()].map(([part, requests]) => ({ part, requests }))
  })

  // Products and power producers share a column: they are both "things to build here", and
  // splitting them would leave four columns of which one is usually empty.
  const hasBuildColumn = computed(() =>
    props.factory.products.length > 0 || props.factory.powerProducers.length > 0)
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

// auto-fit rather than a Vuetify breakpoint on purpose: how much room the checklist actually has
// depends on the card, not the viewport — the sidebar, the zoom level and the browser window all
// move it. The grid drops to two columns, then one, when the card can no longer give each table
// its minimum, so nothing has to be scrolled sideways. That minimum is set by the factory chip:
// it is the stock `sf-chip small factory` the export chips under Satisfaction use, at its natural
// one-line size, and a column too narrow for one beside an item name is a column that would put a
// sideways scrollbar under its table. Better to drop to two columns and keep the chips right.
.checklist-columns {
  display: grid;
  gap: 16px 32px;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
}

// No rule between the columns: the grid re-flows to two (or one) on a narrow card, and a border
// on "every column but the first" then draws a stray line down the middle of a wrapped row. The
// gap and the group titles carry the separation on their own.

.checklist-group {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.checklist-group-title {
  font-weight: bold;
  margin-bottom: 4px;
}

.checklist-table {
  background-color: transparent;
  width: 100%;

  th {
    font-weight: bold;
  }

  .tick-col {
    white-space: nowrap;
    width: 1%;
  }

  // Nothing sizes the item and source columns: left to the table's own algorithm they take their
  // full width when the card has room and only start wrapping once it doesn't. Pinning either one
  // (`width: 1%`, or 100% on the other) forces the loser to its longest word, which wraps item
  // names on a card with pixels to spare.

  // Rows hold icons and chips, and the import/export rows stack several sources into one cell,
  // so v-table's fixed single-line row height has to go.
  :deep(td) {
    height: auto !important;
    padding-top: 6px !important;
    padding-bottom: 6px !important;
  }

  :deep(td),
  :deep(th) {
    padding-left: 0 !important;
    padding-right: 8px !important;

    &:last-child {
      padding-right: 0 !important;
    }
  }
}

.item-inner {
  align-items: center;
  display: flex;
  gap: 8px;
}

// One source/destination factory: its tick, its chip, and the desync flag if it has one, on a
// single line. The chip is the stock `sf-chip small factory` the export chips under Satisfaction
// use — nothing here resizes it, so the two read as the same control.
.checklist-source {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 2px 0;
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
  // no glyph of its own: the row's adjoining desync chip already carries that meaning, and a
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
