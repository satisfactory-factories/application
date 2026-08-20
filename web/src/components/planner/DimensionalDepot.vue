<template>
  <v-row id="dimensional-depot">
    <v-col>
      <v-card class="factory-card">
        <!-- Its own section rather than a card inside Statistics: what goes to the Depot is a
             decision about the plan, not a measurement of it, and it is the one place the
             Uploaders you have to go and build are counted. -->
        <!-- The totals ride in the header rather than in the body, so collapsing the section
             still leaves the numbers on screen — the same reasoning as the power strip on a
             collapsed Statistics card. -->
        <v-row class="header depot-header align-center">
          <v-col class="d-flex align-center flex-wrap ga-2 flex-grow-1">
            <span class="text-h4 d-flex align-center">
              <game-asset height="36" subject="dimensional-depot" type="item_id" width="36" />
              <span class="ml-3 depot-title">Dimensional Depot</span>
            </span>
            <v-chip id="depot-items-summary" class="sf-chip small dimensional-depot no-margin" variant="tonal">
              <i class="fas fa-box" />
              <span class="ml-2">{{ entries.length }} item{{ entries.length === 1 ? '' : 's' }} tracked</span>
            </v-chip>
            <v-chip id="depot-containers-summary" class="sf-chip small dimensional-depot no-margin" variant="tonal">
              <game-asset height="20" subject="dimensional-depot-uploader" type="item_id" width="20" />
              <span class="ml-2">{{ formatNumber(totalContainers) }} Uploader{{ totalContainers === 1 ? '' : 's' }}</span>
            </v-chip>
            <!-- A count, not a sum. Each item's capacity is its own Uploaders' and nothing else's,
                 so "how many items cannot keep up" is the only plan-wide thing worth saying. -->
            <v-chip
              v-if="overCapacityCount > 0"
              id="depot-over-capacity-summary"
              class="sf-chip small status-warning-outlined no-margin"
              variant="tonal"
            >
              <i class="fas fa-tachometer-alt" />
              <span class="ml-2">{{ overCapacityCount }} over capacity</span>
            </v-chip>
          </v-col>
          <v-col class="d-flex align-center justify-end ga-2 text-right" cols="auto">
            <!-- The Mercer Sphere cost of everything here is counted in the statistics rather than
                 repeated on this card, so the header says where instead. -->
            <v-btn class="sf-chip small dimensional-depot mercer-jump" rounded="pill" variant="flat" @click="showMercerStats">
              <game-asset
                class="mr-2"
                height="20"
                subject="mercer-sphere"
                type="item_id"
                width="20"
              />
              Mercer Sphere statistics
            </v-btn>
            <v-btn
              color="primary"
              :prepend-icon="hidden ? 'fas fa-eye' : 'fas fa-eye-slash'"
              :variant="hidden ? 'outlined' : 'flat'"
              @click="hidden = !hidden"
            >{{ hidden ? 'Show' : 'Hide' }}</v-btn>
          </v-col>
        </v-row>
        <v-card-text v-if="!hidden" class="text-body-1">
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" /> Items you have put a Dimensional Depot Uploader on, under a
            factory's Satisfaction. The rate is the surplus each factory has spare to upload.
          </p>
          <!-- The upload rate is not a constant: it starts at 15/min and doubles with each of the
               four MAM upgrades, so a plan written for a fresh save and one written for a finished
               one need very different numbers of Uploaders for the same throughput. Saved on the
               plan, so a shared plan carries the world it was written against. -->
          <div class="d-flex align-center flex-wrap ga-3 mb-2">
            <span class="research-label font-weight-bold">MAM upload research tier:</span>
            <v-select
              id="depot-research-tier"
              v-model="depotTier"
              density="compact"
              hide-details
              item-title="title"
              item-value="value"
              :items="tierOptions"
              style="max-width: 250px"
              variant="outlined"
            />
            <v-chip class="sf-chip small dimensional-depot no-margin" variant="tonal">
              <game-asset height="20" subject="dimensional-depot-uploader" type="item_id" width="20" />
              <span class="ml-2">{{ formatNumber(depotRate) }}/min per Uploader</span>
            </v-chip>
          </div>
          <!-- Expansion changes no number in the planner, which tracks rates rather than how full
               a container is. It is here because it is the other half of what the MAM sells for
               the Depot, and because how much the Depot holds is the reason an Uploader defers a
               backlog instead of fixing it. -->
          <div class="d-flex align-center flex-wrap ga-3 mb-4">
            <span class="research-label font-weight-bold">Depot expansion research:</span>
            <v-select
              id="depot-expansion-tier"
              v-model="depotExpansionTier"
              density="compact"
              hide-details
              item-title="title"
              item-value="value"
              :items="expansionOptions"
              style="max-width: 250px"
              variant="outlined"
            />
            <v-chip class="sf-chip small dimensional-depot no-margin" variant="tonal">
              <i class="fas fa-box" />
              <span class="ml-2">{{ depotStacks }} stack{{ depotStacks === 1 ? '' : 's' }} per item</span>
            </v-chip>
          </div>
          <v-table v-if="entries.length > 0" class="depot-table" density="compact">
            <thead>
              <tr>
                <th class="col-item" scope="col">Item</th>
                <th class="col-rate text-right" scope="col">Upload speed / maximum</th>
                <th class="col-uploaders text-right" scope="col">Uploaders</th>
                <th scope="col">Factories</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in entries" :id="`depot-row-${entry.id}`" :key="entry.id">
                <td class="col-item">
                  <div class="d-flex align-center ga-2">
                    <game-asset
                      clickable
                      height="32"
                      :subject="entry.id"
                      type="item"
                      width="32"
                    />
                    <b>{{ getPartDisplayName(entry.id) }}</b>
                  </div>
                </td>
                <td class="col-rate text-right">
                  <!-- No spare is not a failure, which is why it gets an explanation rather than a
                       warning. An Uploader sits on a splitter, so it takes a share of everything
                       that passes until it is full and then stops accepting — it fills once, it
                       does not need a standing surplus to feed it. -->
                  <v-tooltip v-if="entry.totalAmount <= 0" bottom>
                    <template #activator="{ props: activatorProps }">
                      <span v-bind="activatorProps" class="depot-idle">
                        <b>0</b>
                        <span class="text-medium-emphasis"> / {{ formatNumber(entry.uploadCapacity) }}/min</span>
                      </span>
                    </template>
                    <span>Every factory flagged for this item has its output spoken for, so there is no <em>steady</em> surplus.<br>The Depot still fills: an Uploader takes a share of everything that passes its splitter until it is<br>full, and the line carries on as before once it stops accepting. It only stays empty if you feed<br>it from the low-priority side of a priority splitter.</span>
                  </v-tooltip>
                  <template v-else>
                    <b :class="{ 'text-status-warning': isOverCapacity(entry) }">{{ formatNumber(entry.totalAmount) }}</b>
                    <span class="text-medium-emphasis"> / {{ formatNumber(entry.uploadCapacity) }}/min</span>
                  </template>
                </td>
                <td class="col-uploaders text-right">
                  <v-tooltip v-if="isOverCapacity(entry)" bottom>
                    <template #activator="{ props: activatorProps }">
                      <v-chip v-bind="activatorProps" class="sf-chip small status-warning-outlined">
                        <i class="fas fa-exclamation-triangle mr-2" />{{ formatNumber(entry.totalContainers) }}
                      </v-chip>
                    </template>
                    <span>{{ entry.totalContainers }} Uploader{{ entry.totalContainers === 1 ? '' : 's' }} can take {{ formatNumber(entry.uploadCapacity) }}/min between them at your research level,<br>but {{ formatNumber(entry.totalAmount) }}/min is spare. The remaining {{ formatNumber(entry.totalAmount - entry.uploadCapacity) }}/min backs up.<br>Add Uploaders, or research a faster upload speed.</span>
                  </v-tooltip>
                  <b v-else>{{ formatNumber(entry.totalContainers) }}</b>
                </td>
                <td>
                  <v-chip
                    v-for="source in entry.sources"
                    :key="`${entry.id}-${source.id}`"
                    class="sf-chip sf-chip-clickable small factory"
                    @click="navigateToFactory(source.id, `${source.id}-satisfaction-item-${entry.id}`, `${source.id}-satisfaction`)"
                  >
                    <factory-icon-display :icon="source.icon" size="20" />
                    <span class="ml-2">
                      <b>{{ source.name }}</b>:
                      &times;{{ formatNumber(source.containers) }}
                      <span class="text-medium-emphasis">({{ formatNumber(source.amount) }}/min)</span>
                    </span>
                  </v-chip>
                </td>
              </tr>
            </tbody>
          </v-table>
          <p v-else class="text-body-1">
            Nothing is being sent to the Dimensional Depot. Set an Uploader on a surplus item under a
            factory's <b>Satisfaction &rarr; Storage</b> column to track it here.
          </p>
          <!-- What the Mercer Spheres cost is in the statistics, where the plan's other collectables
               are counted. Repeating it here made this caption a paragraph. -->
          <p class="text-caption text-medium-emphasis mt-3 mb-0">
            Upload speed is per Uploader, so two on one item fill twice as fast. Storage is shared.
          </p>
          <p class="text-caption text-medium-emphasis mt-2 mb-0">
            <b>Upload speed</b> makes use of that item's surplus. Bear in mind it will fluctuate as
            you draw on the Dimensional Depot itself.
          </p>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { getPartDisplayName } from '@/utils/helpers'
  import { calculateDimensionalDepot, DimensionalDepotEntry } from '@/utils/statistics'
  import { DEPOT_EXPANSION_TIERS, DEPOT_UPLOAD_TIERS, useDepotResearch } from '@/composables/useDepotResearch'
  import FactoryIconDisplay from '@/components/planner/FactoryIconDisplay.vue'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // Takes the row to aim at plus a fallback section, so a click lands on the item's own
  // satisfaction row rather than the top of the factory card.
  const navigateToFactory = inject('navigateToFactory') as (
    id: string | number, subsection?: string, fallback?: string
  ) => void

  const {
    depotTier,
    depotRate,
    depotExpansionTier,
    depotStacks,
  } = useDepotResearch()

  const tierOptions = DEPOT_UPLOAD_TIERS.map(tier => ({
    value: tier.tier,
    title: `${tier.label}: ${tier.rate}/min`,
  }))

  const expansionOptions = DEPOT_EXPANSION_TIERS.map(tier => ({
    value: tier.tier,
    title: tier.tier === 0
      ? `Not researched: ${tier.stacks} stack`
      : `Expansion ${tier.tier}: ${tier.stacks} stacks`,
  }))

  const entries = computed(() => calculateDimensionalDepot(props.factories, depotRate.value))

  const totalContainers = computed(() =>
    entries.value.reduce((total, entry) => total + entry.totalContainers, 0))

  /**
   * How many items are arriving faster than their own Uploaders can take.
   *
   * A COUNT rather than a plan-wide rate-against-capacity total, which is what this used to be and
   * was wrong. Capacity belongs to an item: the Uploaders on Iron Plate do nothing for Copper
   * Ingot, so the sum of every item's capacity is not a budget anything spends against. Totalled
   * that way, a plan could read "100/min of 480/min used" while one item sat badly over its own
   * limit and another barely touched its Uploader — and worse, it implied a single global cap,
   * which is not how the Depot works at all.
   */
  const overCapacityCount = computed(() => entries.value.filter(entry => isOverCapacity(entry)).length)

  const isOverCapacity = (entry: DimensionalDepotEntry): boolean =>
    entry.totalAmount > entry.uploadCapacity

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('dimensionalDepotHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('dimensionalDepotHidden', value.toString())
  })

  const showMercerStats = () => eventBus.emit('jumpToSection', 'statistics-mercer-spheres')

  // Sidebar jump-link: landing on a collapsed section just to click Show is pointless.
  eventBus.on('openSection', sectionId => {
    if (sectionId === 'dimensional-depot') {
      hidden.value = false
    }
  })
</script>

<style lang="scss" scoped>
// The Mercer Sphere's muted violet, so the section is recognisable from the page scroll rather
// than from its title. Deliberately blended into the card surface rather than used at full
// strength — a solid violet band next to the Statistics header reads as an error state.
.depot-header {
  background-color: var(--sf-dimensional-depot-panel-bg) !important;
  border-bottom: 2px solid var(--sf-dimensional-depot-panel-border) !important;
}

// The title itself was the one thing on this header still reading as plain white — everything
// beside it (the chips, the panel it sits on) already wears the Depot's own violet.
.depot-title {
  color: var(--sf-dimensional-depot);
}

// Styled as this section's own chips: violet text and border from .sf-chip, plus the translucent
// fill a tonal chip carries, which a v-btn cannot resolve from the token on its own.
.mercer-jump {
  background-color: color-mix(in srgb, var(--sf-dimensional-depot) 12%, transparent) !important;
  margin: 0 !important;
}

// The zero figure carries a tooltip, so it needs to look like something you can hover.
.depot-idle {
  cursor: help;
  border-bottom: 1px dotted rgba(255, 255, 255, 0.4);
}

// Three fixed columns and one free one. The numbers are short and were being handed a third of
// the table each, which pushed the factory pills — the column that actually grows with the plan —
// into a narrow strip that wrapped. The item column is sized to the longest name in the game
// ("Electromagnetic Control Rod") plus its icon, so nothing in it ever wraps either.
.research-label {
  min-width: 210px;
}

.depot-table {
  background-color: transparent;

  th {
    white-space: nowrap;
  }

  .col-item {
    width: 350px;
    max-width: 350px;
  }

  .col-rate {
    width: 200px;
    max-width: 200px;
  }

  .col-uploaders {
    width: 150px;
    max-width: 150px;
  }
}
</style>
