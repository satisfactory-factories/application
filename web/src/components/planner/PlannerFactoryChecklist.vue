<template>
  <v-card class="factory-card sub-card">
    <v-row class="header">
      <v-col class="text-h5 flex-grow-1 d-flex align-center flex-wrap ga-2" cols="8">
        <div>
          <i class="fas fa-check-square" /><span class="ml-3">Checklist</span>
        </div>
        <v-chip class="sf-chip small no-margin" :class="checklistChipClass(factory)">
          {{ completedCount }}/{{ totalCount }} {{ hasChecklistDesync(factory) ? 'ticked, needs reconfirming' : 'complete' }}
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
                      <v-chip v-if="isProductChecklistDesynced(product)" class="sf-chip x-small status-warning no-margin">Desynced</v-chip>
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
                      <v-chip v-if="isPowerProducerChecklistDesynced(producer)" class="sf-chip x-small status-warning no-margin">Desynced</v-chip>
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
                  <th class="source-col">From</th>
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
                        class="sf-chip sf-chip-clickable small factory no-margin"
                        title="Jump to this factory"
                        @click="navigateToFactory(entry.input.factoryId)"
                      >
                        <factory-icon-display :icon="findFactory(entry.input.factoryId).icon" size="20" />
                        <span class="ml-2">{{ findFactory(entry.input.factoryId).name }}</span>
                      </v-chip>
                      <span v-else class="text-body-2 text-medium-emphasis">No factory selected</span>
                      <v-chip v-if="isInputChecklistDesynced(entry.input)" class="sf-chip x-small status-warning no-margin">Desynced</v-chip>
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
                  <th class="source-col">To</th>
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
                        class="sf-chip sf-chip-clickable small factory no-margin"
                        title="Jump to this factory"
                        @click="navigateToFactory(request.requestingFactoryId)"
                      >
                        <factory-icon-display :icon="findFactory(request.requestingFactoryId).icon" size="20" />
                        <span class="ml-2">{{ findFactory(request.requestingFactoryId).name }}</span>
                      </v-chip>
                      <v-chip
                        v-if="isChecklistExportDesynced(factory, request.requestingFactoryId, request.part, request.amount)"
                        class="sf-chip x-small status-warning no-margin"
                      >Desynced</v-chip>
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
    checklistChipClass,
    countChecklistCompleted,
    countChecklistTotal,
    hasChecklistDesync,
    isChecklistExportComplete,
    isChecklistExportDesynced,
    isInputChecklistDesynced,
    isPowerProducerChecklistDesynced,
    isProductChecklistDesynced,
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
// auto-fit rather than a Vuetify breakpoint on purpose: how much room the checklist actually has
// depends on the card, not the viewport — the sidebar, the zoom level and the browser window all
// move it. The grid drops to two columns, then one, when the card can no longer give each table
// its minimum, so nothing has to be scrolled sideways. 300px is what an item name, a tick and a
// factory chip need side by side before the chip starts wrapping its own label to fit.
.checklist-columns {
  display: grid;
  gap: 16px 32px;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
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

  // The tick and item columns carry only their own contents; whatever column is last (the item
  // name for products, the factory chips for imports/exports) takes the slack. Without this a
  // three-up layout stretches the item names halfway across their column. The item cell is
  // deliberately not `nowrap`: a table cell never shrinks below its longest unbreakable line, and
  // an item name pinned to one line is what pushes the factory chip beside it past the column.
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

// One source/destination factory: its tick, its chip, and the desync flag if it has one. Held on
// one line deliberately — a chip that wraps below its own tick reads as an unticked row. The chip
// shrinks and wraps its label instead (see below).
.checklist-source {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 2px 0;

  // Two words at most, and it is the row's warning: it should never be the thing that gets
  // squeezed.
  .sf-chip.status-warning {
    flex-shrink: 0;
  }

  // A long factory name in a third-of-a-card column has to be allowed to wrap inside its chip.
  // Left on one line it sets the column's minimum width, and v-table answers an over-wide table
  // by clipping it.
  .sf-chip.factory {
    flex: 0 1 auto;
    height: auto;
    min-height: 26px;
    min-width: 0;
    white-space: normal;
  }
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
