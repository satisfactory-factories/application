<template>
  <div id="statistics-mercer-spheres" class="d-flex align-center">
    <!-- Each icon next to the words it belongs to, rather than both stacked in front of the title
         where neither says which is which. -->
    <h4 class="text-h4 d-flex align-center flex-wrap">
      <span class="stats-heading-icon"><game-asset height="32" subject="power-shard" type="item_id" width="32" /></span>
      <span class="shards-label">Power Shards,</span>
      <game-asset
        class="ml-2"
        height="32"
        subject="somersloop"
        type="item_id"
        width="32"
      />
      <span class="ml-2 sloops-label">Somersloops &amp;</span>
      <game-asset
        class="ml-2"
        height="32"
        subject="mercer-sphere"
        type="item_id"
        width="32"
      />
      <span class="ml-2 mercer-label">Mercer Spheres</span>
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
              <!-- The MAM research is Mercer Spheres the save spends on the Depot, and it dwarfs
                   what the Uploaders themselves cost, so it is shown. Off the total by default and
                   one tick per node: it is paid once per save, and which of the three a plan should
                   claim is the user's call, not ours. -->
              <tr
                v-for="line in section.researchLines"
                :id="`stats-${section.key}-research-${line.key}`"
                :key="line.key"
                class="research-row"
              >
                <td>
                  <!-- One line, and the label wraps rather than the cell growing. The Mercer column
                       is a third of the row and the table cannot shrink below its widest cell, so
                       anything that refuses to wrap pushes the amounts off the card. -->
                  <div class="d-flex align-center ga-2 research-cell">
                    <!-- The same drawn tick the factory task list uses; see .sf-tick in
                         global.scss for why it is a native checkbox rather than a Vuetify one. -->
                    <input
                      :id="`stats-mercer-include-${line.key}`"
                      :checked="line.included"
                      class="sf-tick"
                      :title="line.included ? `Leave ${line.label} out of the total` : `Count ${line.label} in the total`"
                      type="checkbox"
                      @change="toggleResearch(line.key)"
                    >
                    <span class="research-label" :class="{ 'text-medium-emphasis': !line.included }">
                      {{ line.label }}
                    </span>
                    <tooltip-info :text="line.tooltip" @click.stop />
                    <!-- The same tab values the Dimensional Depot section sets, so a level typed in
                         either place is the one the other shows. -->
                    <span v-if="line.tier" class="d-flex align-center ga-1 tier-row" @focusout="resyncTier">
                      <span class="text-caption text-medium-emphasis">Level</span>
                      <!-- :model-value rather than v-model, and a remount on the way out. An entry
                           the range rejects never emits, so the field goes on showing it while the
                           plan holds something else. See #vnumberinput-clamping. -->
                      <v-number-input
                        :id="`stats-mercer-tier-${line.key}`"
                        :key="tierKey"
                        class="inline-inputs tier-input"
                        control-variant="stacked"
                        density="compact"
                        hide-details
                        :max="MAX_DEPOT_TIER"
                        :min="0"
                        :model-value="line.key === 'upload' ? depotTier : depotExpansionTier"
                        @update:model-value="setTier(line.key, $event)"
                      />
                    </span>
                  </div>
                </td>
                <td class="text-right" :class="{ 'text-medium-emphasis': !line.included }">
                  <b>{{ formatNumber(line.amount) }}</b>
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
  import {
    clampTier,
    DEPOT_UNLOCK_MERCER_SPHERES,
    MANUAL_UPLOADER_MERCER_SPHERES,
    MAX_DEPOT_TIER,
    useDepotResearch,
  } from '@/composables/useDepotResearch'
  import TooltipInfo from '@/components/tooltip-info.vue'

  const props = defineProps<{
    factories: Factory[];
  }>()

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  const sumAmounts = (entries: { amount: number }[]) => entries.reduce((total, entry) => total + entry.amount, 0)

  const RESEARCH_KEYS = ['upload', 'expansion', 'manual'] as const
  type ResearchKey = typeof RESEARCH_KEYS[number]

  // Only the Mercer column has any, but every section declares the field so the template can ask.
  interface ResearchLine {
    key: ResearchKey
    label: string
    amount: number
    tooltip: string
    included: boolean
    // Set on the two lines whose cost is decided by a research level the plan carries, which is
    // what puts a level field on the row. The Manual Uploader is a single node with no levels.
    tier?: boolean
  }

  // The two tiers the plan is written against decide what its research costs, so this reads the
  // settings the Dimensional Depot section carries rather than assuming a finished save.
  const {
    depotResearchSpheres,
    depotResearchName,
    depotStacks,
    depotExpansionSpheres,
    depotTier,
    depotExpansionTier,
  } = useDepotResearch()

  // All off by default: the Uploaders are what this plan builds, the research is what the save
  // paid for once. Persisted per node, because which of them a user counts is a statement about
  // how they read the numbers rather than about any one plan.
  const storageKey = (key: ResearchKey) => `statisticsMercerInclude:${key}`

  const included = ref<Record<ResearchKey, boolean>>(
    Object.fromEntries(
      RESEARCH_KEYS.map(key => [key, localStorage.getItem(storageKey(key)) === 'true'])
    ) as Record<ResearchKey, boolean>
  )

  // The two research levels are the plan's, not this table's: the Dimensional Depot section reads
  // and writes the same tab fields, so a level set here is the one it shows and vice versa.
  const tierKey = ref(0)

  const setTier = (key: ResearchKey, value: unknown) => {
    // An empty field is not a level. Vuetify emits null for it the moment the digit is deleted,
    // and reading that as 0 would quietly drop the plan to unresearched mid-edit.
    if (value === null || value === undefined || value === '') return

    const clamped = clampTier(value)
    if (key === 'upload') depotTier.value = clamped
    else depotExpansionTier.value = clamped
  }

  // Remount both fields once focus leaves, which is what puts the stored level back on screen after
  // an emptied field. Skipped while focus moves within the field, or a stepper click is unmounted
  // out from under itself.
  const resyncTier = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    if (next && (event.currentTarget as HTMLElement).contains(next)) return
    tierKey.value++
  }

  const toggleResearch = (key: ResearchKey) => {
    included.value[key] = !included.value[key]
    localStorage.setItem(storageKey(key), included.value[key].toString())
  }

  // Two rules here, both learned the hard way. Labels carry no bracketed tier: the column is a
  // third of the row and the table cannot shrink below its widest label, so a parenthetical
  // pushed the amounts out of the card entirely. And tooltips stay to one fact each, because
  // nobody reads a paragraph hovering over a table row.
  const researchLines = computed<ResearchLine[]>(() => [
    {
      key: 'upload',
      label: 'Upload research',
      amount: depotResearchSpheres.value,
      included: included.value.upload,
      tier: true,
      tooltip: `Unlocking the Depot (${DEPOT_UNLOCK_MERCER_SPHERES}), plus every upload upgrade up to ${depotResearchName.value}.`,
    },
    {
      key: 'expansion',
      label: 'Depot expansion',
      amount: depotExpansionSpheres.value,
      included: included.value.expansion,
      tier: true,
      tooltip: `Every Depot Expansion upgrade up to ${depotStacks.value} stack${depotStacks.value === 1 ? '' : 's'} per item.`,
    },
    {
      key: 'manual',
      label: 'Manual Uploader',
      amount: MANUAL_UPLOADER_MERCER_SPHERES,
      included: included.value.manual,
      tooltip: 'Uploading from your own inventory. Optional, and nothing in a plan depends on it.',
    },
  ])

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
        researchLines: [] as ResearchLine[],
      },
      {
        key: 'sloops',
        title: 'Somersloops',
        icon: 'somersloop',
        chipClass: 'somersloop',
        empty: 'No Somersloops used in this plan.',
        entries: sloops,
        total: sumAmounts(sloops),
        researchLines: [] as ResearchLine[],
      },
      {
        key: 'mercer',
        title: 'Mercer Spheres',
        icon: 'mercer-sphere',
        chipClass: 'dimensional-depot',
        empty: 'No Dimensional Depot Uploaders in this plan.',
        entries: spheres,
        total: sumAmounts(spheres) + sumAmounts(researchLines.value.filter(line => line.included)),
        researchLines: researchLines.value,
      },
    ]
  })

  // Header at-a-glance totals — only for whichever of the three is actually in use.
  const summarySections = computed(() => sections.value.filter(section => section.total > 0))

  // Section visibility, persisted. Hidden by default until explicitly shown.
  const hidden = ref<boolean>(localStorage.getItem('statisticsShardsSloopsHidden') !== 'false')
  watch(hidden, value => {
    localStorage.setItem('statisticsShardsSloopsHidden', value.toString())
  })
</script>

<style lang="scss" scoped>
// Matches the summary chips' own colours (chipClass 'yellow' / 'somersloop' / 'dimensional-depot'
// above), so each name is the colour of the thing it counts.
.shards-label {
  color: var(--sf-yellow);
}

.sloops-label {
  color: var(--sf-somersloop);
}

.mercer-label {
  color: var(--sf-dimensional-depot);
}

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

// Two lines of room, which is what the label needs to wrap in a third of the row. Any less and
// the cell refuses to shrink, taking the Amount column off the card with it.
.research-cell {
  min-height: 44px;

  .sf-tick {
    flex: 0 0 auto;
  }
}

.research-label {
  line-height: 1.2;
  min-width: 0;
}

// Pinned to the right of the cell so the two level fields line up with each other.
.tier-row {
  flex: 0 0 auto;
  margin-left: auto;
}

// Wide enough for one digit plus the stacked steppers, and no wider.
.tier-input {
  width: 78px;
  flex: 0 0 auto;
}
</style>
