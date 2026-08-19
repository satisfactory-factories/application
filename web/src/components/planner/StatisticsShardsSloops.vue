<template>
  <div class="d-flex align-center">
    <!-- Each icon next to the words it belongs to, rather than both stacked in front of the title
         where neither says which is which. -->
    <h4 class="text-h4 d-flex align-center ga-1 flex-wrap">
      <game-asset height="32" subject="power-shard" type="item_id" width="32" />
      <span class="ml-2 mr-2">Power Shards,</span>
      <game-asset height="32" subject="somersloop" type="item_id" width="32" />
      <span class="ml-2 mr-2">Somersloops &amp;</span>
      <game-asset height="32" subject="mercer-sphere" type="item_id" width="32" />
      <span class="ml-2">Mercer Spheres</span>
    </h4>
    <v-chip
      v-for="(section, index) in summarySections"
      :id="`stats-${section.key}-summary`"
      :key="`${section.key}-summary`"
      class="sf-chip small"
      :class="[section.chipClass, { 'ml-3': index === 0 }]"
      variant="tonal"
    >
      <game-asset
        height="20"
        :subject="section.icon"
        type="item_id"
        width="20"
      />
      <span class="ml-2">{{ formatNumber(section.total) }}</span>
    </v-chip>
    <v-btn
      class="ml-auto"
      color="primary"
      :prepend-icon="hidden ? 'fas fa-eye' : 'fas fa-eye-slash'"
      size="small"
      :variant="hidden ? 'outlined' : 'flat'"
      @click="hidden = !hidden"
    >{{ hidden ? 'Show' : 'Hide' }}</v-btn>
  </div>
  <template v-if="!hidden">
    <p v-show="helpText" class="mb-4">
      <i class="fas fa-info-circle" /> Shows which factories use Power Shards and Somersloops in their building
      groups, and which spend Mercer Spheres on Dimensional Depot Uploaders.
    </p>
    <v-row id="stats-shards-sloops" class="mt-1">
      <v-col
        v-for="section in sections"
        :key="section.key"
        cols="12"
        md="4"
      >
        <div class="usage-block mx-auto">
          <h2 class="text-subtitle-1 font-weight-bold d-flex align-center justify-center">
            <game-asset
              height="20"
              :subject="section.icon"
              type="item_id"
              width="20"
            />
            <span class="ml-2">{{ section.title }}</span>
          </h2>
          <v-table v-if="section.entries.length > 0" class="usage-table" density="compact">
            <thead>
              <tr>
                <th>Factory</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in section.entries"
                :key="`${section.key}-${entry.factory.id}`"
                class="hover"
                @click="navigateToFactory(entry.factory.id)"
              >
                <td>
                  <v-chip class="sf-chip small factory">
                    <i class="fas fa-industry" />
                    <b class="ml-2">{{ entry.factory.name }}</b>
                  </v-chip>
                </td>
                <td class="text-right"><b>{{ formatNumber(entry.amount) }}</b></td>
              </tr>
            </tbody>
            <tfoot>
              <!-- Research is a line of its own rather than a footnote: it is Mercer Spheres the
                   save has to spend before a single Uploader works, and it dwarfs what the
                   Uploaders themselves cost. Excluded from the total by default all the same —
                   it is paid once per save, so counting it in a plan would have two plans in one
                   save each claim the same spheres. -->
              <tr v-if="section.research" :id="`stats-${section.key}-research`" class="research-row">
                <td>
                  <!-- Box and tick drawn in CSS, as in the Options dialog: Vuetify's FA aliases use
                       `far fa-square` for the unchecked state and this app ships no Font Awesome
                       regular family, so a v-checkbox has nothing to draw until it is ticked. -->
                  <div
                    id="stats-mercer-include-research"
                    :aria-checked="includeResearch"
                    class="research-toggle d-flex align-center ga-2"
                    role="checkbox"
                    tabindex="0"
                    @click="includeResearch = !includeResearch"
                    @keydown.enter.prevent="includeResearch = !includeResearch"
                    @keydown.space.prevent="includeResearch = !includeResearch"
                  >
                    <span class="tick" :class="{ on: includeResearch }" />
                    <span class="research-label" :class="{ 'text-medium-emphasis': !includeResearch }">
                      MAM research
                      <span class="text-caption">({{ section.research.label }})</span>
                    </span>
                    <tooltip-info
                      :is-caption="false"
                      :text="section.research.tooltip"
                      @click.stop
                    />
                  </div>
                </td>
                <td class="text-right" :class="{ 'text-medium-emphasis': !includeResearch }">
                  <b>{{ formatNumber(section.research.amount) }}</b>
                </td>
              </tr>
              <tr :id="`stats-${section.key}-total`" class="total-row">
                <td><b>Total</b></td>
                <td class="text-right"><b>{{ formatNumber(section.total) }}</b></td>
              </tr>
            </tfoot>
          </v-table>
          <p v-else class="text-body-1 text-center">{{ section.empty }}</p>
        </div>
      </v-col>
    </v-row>
  </template>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import {
    calculateFactoriesUsing,
    getFactoryPowerShards,
    getFactorySomersloops,
  } from '@/utils/statistics'
  import { getFactoryMercerSpheres } from '@/utils/factory-management/disposal'
  import { DEPOT_UNLOCK_MERCER_SPHERES, useDepotResearch } from '@/composables/useDepotResearch'
  import TooltipInfo from '@/components/tooltip-info.vue'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  const sumAmounts = (entries: { amount: number }[]) => entries.reduce((total, entry) => total + entry.amount, 0)

  // Only the Mercer column has one, but every section declares it so the template can ask.
  interface ResearchLine {
    amount: number
    label: string
    tooltip: string
  }

  // The upload tier the plan is written against decides what its research cost is, so this reads
  // the same setting the Dimensional Depot section carries rather than assuming a finished save.
  const { depotResearchSpheres, depotTierName, depotResearchName } = useDepotResearch()

  // Off by default: the Uploaders are what this plan builds, the research is what the save paid
  // for once. Persisted, because it is a statement about how the user counts rather than about
  // any one plan.
  const includeResearch = ref<boolean>(localStorage.getItem('statisticsMercerIncludeResearch') === 'true')
  watch(includeResearch, value => {
    localStorage.setItem('statisticsMercerIncludeResearch', value.toString())
  })

  const sections = computed(() => {
    const shards = calculateFactoriesUsing(props.factories, getFactoryPowerShards)
    const sloops = calculateFactoriesUsing(props.factories, getFactorySomersloops)
    // One per Dimensional Depot Uploader placed in the Storage column of a factory's Satisfaction.
    // The MAM research spheres are a once-per-save cost, so they get their own line below the
    // factories rather than being folded into them — see the research row.
    const spheres = calculateFactoriesUsing(props.factories, getFactoryMercerSpheres)
    return [
      {
        key: 'shards',
        title: 'Power Shards',
        icon: 'power-shard',
        chipClass: 'yellow',
        empty: 'No Power Shards used in this plan.',
        entries: shards,
        total: sumAmounts(shards),
        research: null as ResearchLine | null,
      },
      {
        key: 'sloops',
        title: 'Somersloops',
        icon: 'somersloop',
        chipClass: 'somersloop',
        empty: 'No Somersloops used in this plan.',
        entries: sloops,
        total: sumAmounts(sloops),
        research: null as ResearchLine | null,
      },
      {
        key: 'mercer',
        title: 'Mercer Spheres',
        icon: 'mercer-sphere',
        chipClass: 'dimensional-depot',
        empty: 'No Dimensional Depot Uploaders in this plan.',
        entries: spheres,
        total: sumAmounts(spheres) + (includeResearch.value ? depotResearchSpheres.value : 0),
        research: {
          amount: depotResearchSpheres.value,
          label: depotResearchName.value,
          tooltip: `${DEPOT_UNLOCK_MERCER_SPHERES} Mercer Spheres unlock the Dimensional Depot in the MAM (Mercer Sphere Analysis, then the Depot itself),<br>plus every upload upgrade up to the tier set in the Dimensional Depot section — currently ${depotTierName.value}.<br><br>Tick to add it to the total. Off by default because it is paid once per save, not once per plan,<br>so two plans in one save would otherwise both claim the same spheres.<br><br>Excludes the Depot Expansion upgrades (46 more), which buy storage the planner does not model.`,
        },
      },
    ]
  })

  // Header at-a-glance totals — only for whichever of the three is actually in use.
  const summarySections = computed(() => sections.value.filter(section => section.total > 0))

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('statisticsShardsSloopsHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('statisticsShardsSloopsHidden', value.toString())
  })
</script>

<style lang="scss" scoped>
.usage-block {
  max-width: 420px;
}

.usage-table {
  background-color: transparent;

  tbody tr.hover {
    cursor: pointer;

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
  }

  tfoot .total-row td {
    border-top: 2px solid rgba(255, 255, 255, 0.24);
  }
}

.research-toggle {
  cursor: pointer;
  user-select: none;
  width: fit-content;
}

// One line: wrapped onto two, the tier in brackets ends up under the tick and reads as a second
// row of the table rather than as part of this one.
.research-label {
  white-space: nowrap;
}

.tick {
  position: relative;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-radius: 3px;
  display: inline-block;
  flex: 0 0 auto;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.tick.on {
  background-color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}

// Two borders of a rotated box: the short arm and the long arm of a tick.
.tick.on::after {
  content: '';
  position: absolute;
  left: 3.5px;
  top: -0.5px;
  width: 4px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
</style>
