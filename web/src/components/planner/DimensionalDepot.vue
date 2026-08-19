<template>
  <v-row id="dimensional-depot">
    <v-col>
      <v-card class="factory-card">
        <!-- Its own section rather than a card inside Statistics: what goes to the Depot is a
             decision about the plan, not a measurement of it, and it is the one place the
             Uploaders you have to go and build are counted. -->
        <v-row class="header depot-header">
          <v-col class="text-h4 flex-grow-1 d-flex align-center" cols="8">
            <game-asset height="36" subject="dimensional-depot" type="item_id" width="36" />
            <span class="ml-3">Dimensional Depot</span>
          </v-col>
          <v-col class="text-right" cols="4">
            <v-btn
              color="primary"
              :prepend-icon="hidden ? 'fas fa-eye' : 'fas fa-eye-slash'"
              :variant="hidden ? 'outlined' : 'flat'"
              @click="hidden = !hidden"
            >{{ hidden ? 'Show' : 'Hide' }}</v-btn>
          </v-col>
        </v-row>
        <v-card-text v-if="!hidden" class="text-body-1">
          <div class="d-flex align-center flex-wrap ga-2 mb-4">
            <v-chip id="depot-items-summary" class="sf-chip small dimensional-depot no-margin" variant="tonal">
              <i class="fas fa-box" />
              <span class="ml-2">{{ entries.length }} item{{ entries.length === 1 ? '' : 's' }} tracked</span>
            </v-chip>
            <v-chip id="depot-containers-summary" class="sf-chip small dimensional-depot no-margin" variant="tonal">
              <game-asset height="20" subject="dimensional-depot-uploader" type="item_id" width="20" />
              <span class="ml-2">{{ formatNumber(totalContainers) }} Uploader{{ totalContainers === 1 ? '' : 's' }}</span>
            </v-chip>
            <v-chip id="depot-mercer-summary" class="sf-chip small dimensional-depot no-margin" variant="tonal">
              <game-asset height="20" subject="mercer-sphere" type="item_id" width="20" />
              <span class="ml-2">{{ formatNumber(totalMercerSpheres) }} Mercer Sphere{{ totalMercerSpheres === 1 ? '' : 's' }}</span>
            </v-chip>
            <v-chip
              v-if="starvedCount > 0"
              id="depot-starved-summary"
              class="sf-chip small status-warning-outlined no-margin"
              variant="tonal"
            >
              <i class="fas fa-exclamation-triangle" />
              <span class="ml-2">{{ starvedCount }} receiving nothing</span>
            </v-chip>
          </div>
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" /> Items you have put a Dimensional Depot Uploader on, under a
            factory's Satisfaction. The rate is the surplus each factory has spare to upload.
          </p>
          <!-- The upload rate is not a constant: it starts at 15/min and doubles with each of the
               four MAM upgrades, so a plan written for a fresh save and one written for a finished
               one need very different numbers of Uploaders for the same throughput. Saved on the
               plan, so a shared plan carries the world it was written against. -->
          <div class="d-flex align-center flex-wrap ga-3 mb-4">
            <span class="font-weight-bold">Upload research:</span>
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
            <v-chip
              v-if="totalContainers > 0"
              id="depot-capacity-summary"
              class="sf-chip small no-margin"
              :class="overCapacity ? 'status-warning-outlined' : 'green'"
              variant="tonal"
            >
              <i class="fas fa-gauge" />
              <span class="ml-2">
                {{ formatNumber(totalAmount) }}/min of {{ formatNumber(totalCapacity) }}/min used
              </span>
            </v-chip>
          </div>
          <v-table v-if="entries.length > 0" class="depot-table" density="compact">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th class="text-right" scope="col">Into Depot / capacity</th>
                <th class="text-right" scope="col">Uploaders</th>
                <th scope="col">Factories</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in entries" :id="`depot-row-${entry.id}`" :key="entry.id">
                <td>
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
                <td class="text-right">
                  <!-- Starved and over-capacity are different failures and both are worth saying:
                       one means nothing is arriving, the other means more is arriving than the
                       Uploaders can take, so the remainder still backs up. -->
                  <v-tooltip v-if="entry.starved" bottom>
                    <template #activator="{ props: activatorProps }">
                      <v-chip v-bind="activatorProps" class="sf-chip small status-warning-outlined">
                        <i class="fas fa-exclamation-triangle mr-2" />Nothing spare
                      </v-chip>
                    </template>
                    <span>Every factory flagged for this item has its whole output spoken for by exports or internal use,<br>so nothing at all reaches the Depot.</span>
                  </v-tooltip>
                  <template v-else>
                    <b :class="{ 'text-status-warning': isOverCapacity(entry) }">{{ formatNumber(entry.totalAmount) }}</b>
                    <span class="text-medium-emphasis"> / {{ formatNumber(entry.uploadCapacity) }}/min</span>
                  </template>
                </td>
                <td class="text-right">
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
                    :class="{ 'status-warning-outlined': source.amount <= 0 }"
                    @click="navigateToFactory(source.id)"
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
          <!-- Stated rather than added to the total: it is paid once for the save, so charging it
               to every plan would have two plans in one save each claim the same 97 spheres. -->
          <p class="text-caption text-medium-emphasis mt-3 mb-0">
            One Mercer Sphere per Uploader. Unlocking the Depot and buying every upload-speed and
            capacity upgrade costs a further {{ DEPOT_RESEARCH_MERCER_SPHERES }} Mercer Spheres in the
            MAM, once per save — not counted above. Upload speed applies per Uploader, so two
            Uploaders on one item move twice as much.
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
  import { DEPOT_RESEARCH_MERCER_SPHERES } from '@/utils/factory-management/disposal'
  import { DEPOT_UPLOAD_TIERS, useDepotResearch } from '@/composables/useDepotResearch'
  import FactoryIconDisplay from '@/components/planner/FactoryIconDisplay.vue'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  const { depotTier, depotRate } = useDepotResearch()

  const tierOptions = DEPOT_UPLOAD_TIERS.map(tier => ({
    value: tier.tier,
    title: `${tier.label} — ${tier.rate}/min`,
  }))

  const entries = computed(() => calculateDimensionalDepot(props.factories, depotRate.value))

  const totalContainers = computed(() =>
    entries.value.reduce((total, entry) => total + entry.totalContainers, 0))

  // One sphere per Uploader, so this is the container count — kept as its own computed rather than
  // written as `totalContainers` so the ratio lives in one place if it ever stops being one.
  const totalMercerSpheres = computed(() =>
    entries.value.reduce((total, entry) => total + entry.totalContainers, 0))

  const starvedCount = computed(() => entries.value.filter(entry => entry.starved).length)

  // Plan-wide throughput against plan-wide capacity. Deliberately a sum rather than a per-item
  // verdict: an item over capacity is called out on its own row, and this says whether the plan as
  // a whole has enough Uploaders in it.
  const totalAmount = computed(() =>
    entries.value.reduce((total, entry) => total + entry.totalAmount, 0))
  const totalCapacity = computed(() =>
    entries.value.reduce((total, entry) => total + entry.uploadCapacity, 0))
  const overCapacity = computed(() => entries.value.some(entry => isOverCapacity(entry)))

  const isOverCapacity = (entry: DimensionalDepotEntry): boolean =>
    !entry.starved && entry.totalAmount > entry.uploadCapacity

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('dimensionalDepotHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('dimensionalDepotHidden', value.toString())
  })

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
  background-color: rgba(159, 109, 159, 0.22) !important;
  border-bottom: 2px solid var(--sf-dimensional-depot-border) !important;
}

.depot-table {
  background-color: transparent;

  th {
    white-space: nowrap;
  }
}
</style>
