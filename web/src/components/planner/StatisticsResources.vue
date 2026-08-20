<template>
  <div class="d-flex align-center flex-wrap ga-2 mb-4">
    <h4 class="text-h4" :class="{ 'text-red': problems.blockers > 0 }">
      <i class="fas fa-globe" />
      <span class="ml-3">Raw Resources</span>
    </h4>
    <v-chip
      v-if="allFactoryRawResources.length > 0"
      id="stats-raw-resources-summary"
      class="sf-chip raw-resource small no-margin"
      variant="tonal"
    >
      {{ allFactoryRawResources.length }} {{ allFactoryRawResources.length === 1 ? 'resource' : 'resources' }}
    </v-chip>
    <!-- The section can be collapsed, and is on a returning visitor, so the header has to be able
         to say something inside it is wrong on its own. -->
    <v-chip
      v-if="problems.blockers > 0"
      id="stats-raw-resources-problems"
      class="sf-chip status-problem small no-margin"
      variant="flat"
    >
      <i class="fas fa-exclamation-triangle" />
      <span class="ml-2">{{ problems.blockers }} beyond the map</span>
    </v-chip>
    <v-chip
      v-if="problems.needsOverclock.length > 0"
      id="stats-raw-resources-shards"
      class="sf-chip status-warning small no-margin"
      variant="flat"
    >
      <i class="fas fa-bolt" />
      <span class="ml-2">{{ problems.needsOverclock.length }} needing shards</span>
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
      <i class="fas fa-info-circle" /> Shows how much of the world your plan uses: everything your
      factories mine, pump or extract, against what the map holds. <b>Extraction</b> is what you
      take against the most the world can give — every node worked by its best extractor at the
      250% clock cap. <b>Nodes</b> is how many extractors your plan places against how many nodes
      exist to stand on. Figures assume the default vanilla world; 1.2's randomised worlds and the
      resource-rich game modes deal different node counts.
    </p>
    <v-alert
      v-if="problems.blockers > 0"
      id="stats-raw-resources-alert"
      class="mb-4"
      density="compact"
      type="error"
      variant="tonal"
    >
      <b>Parts of this plan cannot be built on the map.</b>
      <div v-if="problems.overCapacity.length > 0">
        The world does not hold as much {{ nameList(problems.overCapacity) }} as the plan takes,
        however the extractors are clocked.
      </div>
      <div v-if="problems.overNodes.length > 0">
        More extractors are placed than there are nodes to stand on
        for {{ nameList(problems.overNodes) }}.
      </div>
    </v-alert>
    <v-table v-if="allFactoryRawResources.length > 0" id="stats-raw-resources" class="stats-table" density="compact">
      <thead>
        <tr>
          <th>Resource</th>
          <th>Utilisation</th>
          <th>Extracted by</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="resource in allFactoryRawResources" :key="resource.id">
          <td>
            <v-chip class="sf-chip cyan no-margin" variant="tonal">
              <game-asset clickable :subject="resource.id" type="item" />
              <b class="ml-2">{{ getPartDisplayName(resource.id) }}</b>
            </v-chip>
            <!-- Under the name, the way the Factories Summary hangs its status chips off a
                 factory: what is wrong with this resource is a property of the resource, not a
                 footnote to whichever bar happens to be over. -->
            <div v-if="resource.statuses.length > 0" class="d-flex flex-wrap ga-1 mt-1">
              <v-chip
                v-for="status in resource.statuses"
                :key="status.key"
                class="sf-chip x-small no-margin"
                :class="status.class"
                variant="flat"
              >
                <i :class="status.icon" />
                <span class="ml-2">{{ status.label }}</span>
              </v-chip>
            </div>
          </td>
          <!-- Extraction and nodes are the same question asked twice — how much of what exists is
               spoken for — so they read as two bars of one measure rather than two columns. -->
          <td class="utilisation">
            <template v-if="!resource.utilisation">
              <span class="text-medium-emphasis">&mdash;</span>
            </template>
            <template v-else-if="resource.utilisation.status === 'unlimited'">
              <div class="bar-row">
                <span class="bar-label">Extraction</span>
                <span class="text-caption text-medium-emphasis">Unlimited &mdash; drawn from any shoreline</span>
                <span class="bar-values"><b>{{ formatCompactPrecise(resource.totalAmount) }}</b>/min</span>
              </div>
            </template>
            <template v-else>
              <div class="bar-row">
                <span class="bar-label">Extraction</span>
                <v-progress-linear
                  bg-opacity="0.15"
                  :color="barColour(resource.utilisation.ofMaxClock)"
                  height="10"
                  :model-value="barValue(resource.utilisation.ofMaxClock)"
                  rounded
                />
                <span class="bar-values">
                  <b>{{ formatCompactPrecise(resource.totalAmount) }}</b>
                  <span class="text-medium-emphasis"> / {{ formatCompactPrecise(resource.utilisation.capacity.atMaxClock) }}</span>/min
                </span>
              </div>
              <!-- "92.1k/min at 250%" is meaningless without the machine it assumes: the same
                   nodes worked by a Mk.1 come to a quarter of it. -->
              <div class="bar-caption text-caption text-medium-emphasis">
                {{ getBuildingDisplayName(resource.utilisation.capacity.extractor) }} at 250%
                &middot; {{ formatCompactPrecise(resource.utilisation.capacity.atStandardClock) }}/min at 100%
              </div>
              <div v-if="resource.nodeUsage && totalNodes(resource.nodeUsage.nodesAvailable) > 0" class="bar-row">
                <span class="bar-label">Nodes</span>
                <v-progress-linear
                  bg-opacity="0.15"
                  :color="barColour(nodeFraction(resource.nodeUsage.nodesUsed, resource.nodeUsage.nodesAvailable))"
                  height="10"
                  :model-value="barValue(nodeFraction(resource.nodeUsage.nodesUsed, resource.nodeUsage.nodesAvailable))"
                  rounded
                />
                <span class="bar-values">
                  <b>{{ formatCompactPrecise(totalNodes(resource.nodeUsage.nodesUsed)) }}</b>
                  <span class="text-medium-emphasis"> / {{ formatCompactPrecise(totalNodes(resource.nodeUsage.nodesAvailable)) }}</span>
                </span>
              </div>
              <!-- Only where wells are actually in play: every oil plan would otherwise carry a
                   "0 / 18" well row saying nothing. -->
              <div
                v-if="resource.nodeUsage && (totalNodes(resource.nodeUsage.satellitesUsed) > 0 || totalNodes(resource.nodeUsage.nodesAvailable) === 0)"
                class="bar-row"
              >
                <span class="bar-label">Well nodes</span>
                <v-progress-linear
                  bg-opacity="0.15"
                  :color="barColour(nodeFraction(resource.nodeUsage.satellitesUsed, resource.nodeUsage.satellitesAvailable))"
                  height="10"
                  :model-value="barValue(nodeFraction(resource.nodeUsage.satellitesUsed, resource.nodeUsage.satellitesAvailable))"
                  rounded
                />
                <span class="bar-values">
                  <b>{{ formatCompactPrecise(totalNodes(resource.nodeUsage.satellitesUsed)) }}</b>
                  <span class="text-medium-emphasis"> / {{ formatCompactPrecise(totalNodes(resource.nodeUsage.satellitesAvailable)) }}</span>
                </span>
              </div>
              <!-- What is left in prose is advice rather than status: which Converter recipe makes
                   up the shortfall, or which purities to spread across. The status itself is a
                   chip beside the resource name. -->
              <div v-if="resource.details.length > 0" class="details text-caption mt-1">
                <div v-for="detail in resource.details" :key="detail">{{ detail }}</div>
              </div>
            </template>
          </td>
          <td>
            <!-- One chip per factory digging it up, the same shape the collapsed card uses for
                 its exports: icon, name, its own share, and a click that goes there. A total on
                 its own says a plan is short without saying where to go and fix it. -->
            <div class="source-chips d-flex flex-wrap ga-2">
              <div
                v-for="source in resource.sources"
                :key="source.id"
                class="factory-group-chip clickable"
                @click="navigateToFactory(source.id)"
              >
                <factory-icon-display class="ml-1" :icon="source.icon" size="20" />
                <span class="mx-2"><b>{{ source.name }}</b></span>
                <!-- No item icon: the resource is named in the first column of this very row,
                     and repeating it in every chip only crowds the number out. -->
                <v-chip class="sf-chip small product">{{ formatNumber(source.amount) }}/min</v-chip>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </v-table>
    <p v-else class="text-body-1">Nothing in this plan extracts a raw resource yet.</p>
  </template>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { formatCompactPrecise, formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalRawResources } from '@/utils/statistics'
  import {
    getPartDisplayName,
  } from '@/utils/helpers'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import { PURITY_LABELS } from '@/utils/factory-management/building-groups/extraction'
  import {
    calculateResourceNodeUsage,
    calculateWorldResourceProblems,
    getResourceUtilisation,
    NodeCounts,
    ResourceNodeUsage,
    ResourceUtilisation,
    totalNodes,
  } from '@/utils/world-resources'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  interface ResourceStatus {
    key: string
    label: string
    icon: string
    class: string
  }

  // Bars are read at a glance rather than measured, so the colour has to carry the meaning: green
  // while there is room, amber from 60% where the resource is worth thinking about, red from 80%
  // where it is nearly spoken for. Anything over the ceiling pins at full and stays red.
  const barColour = (fraction: number) => {
    if (fraction >= 0.8) return 'var(--sf-error)'
    return fraction >= 0.6 ? 'var(--sf-status-warning)' : 'var(--sf-success)'
  }

  const barValue = (fraction: number) => Math.min(100, Math.max(0, fraction * 100))

  const nodeFraction = (used: NodeCounts, available: NodeCounts) => {
    const total = totalNodes(available)
    // No nodes at all means nothing to be a fraction of; any extractor on it is over the line.
    return total > 0 ? totalNodes(used) / total : (totalNodes(used) > 0 ? Infinity : 0)
  }

  /**
   * What is wrong with a resource, as chips beside its name.
   *
   * The rate check and the node check are separate questions — whether the resource exists in
   * that quantity, and whether the extractors fit — and a plan can pass one and fail the other,
   * so each gets to speak. Nothing repeats a figure the bars already carry.
   */
  const buildStatuses = (
    utilisation: ResourceUtilisation | undefined,
    nodeUsage: ResourceNodeUsage | undefined,
  ): ResourceStatus[] => {
    const statuses: ResourceStatus[] = []
    if (!utilisation || utilisation.status === 'unlimited') {
      return statuses
    }

    if (utilisation.status === 'impossible') {
      statuses.push({
        key: 'capacity',
        label: 'Beyond the map',
        icon: 'fas fa-exclamation-triangle',
        class: 'status-problem',
      })
    } else if (utilisation.status === 'needsOverclock') {
      statuses.push({
        key: 'shards',
        label: 'Needs power shards',
        icon: 'fas fa-bolt',
        class: 'status-warning',
      })
    }

    if (nodeUsage?.overcommitted) {
      statuses.push({
        key: 'nodes',
        label: 'Not enough nodes',
        icon: 'fas fa-map-marker-alt',
        class: 'status-problem',
      })
    } else if (nodeUsage?.overcommittedPurities.length) {
      statuses.push({
        key: 'purity',
        label: 'Purity mismatch',
        icon: 'fas fa-layer-group',
        class: 'status-note',
      })
    }

    return statuses
  }

  // Advice rather than status: what to do about it, which no chip or bar can say.
  const buildDetails = (
    utilisation: ResourceUtilisation | undefined,
    nodeUsage: ResourceNodeUsage | undefined,
  ): string[] => {
    const details: string[] = []
    if (!utilisation || utilisation.status === 'unlimited') {
      return details
    }

    if (utilisation.status === 'impossible') {
      // Naming the recipes matters: it is the difference between "give up" and "this is the
      // Converter recipe that gets you the rest".
      details.push(utilisation.conversionRecipes.length > 0
        ? `Needs the Converter: ${utilisation.conversionRecipes.join(', ')}.`
        : 'No Converter recipe makes this — the map total is final.')
    }

    // The node bars total the three purities, so the one thing about nodes still worth writing
    // out is which purity a plan has overcommitted while its totals still fit.
    if (!nodeUsage?.overcommitted) {
      nodeUsage?.overcommittedPurities.forEach(purity => {
        const used = nodeUsage.nodesUsed[purity] + nodeUsage.satellitesUsed[purity]
        const available = nodeUsage.nodesAvailable[purity] + nodeUsage.satellitesAvailable[purity]
        details.push(`${used} on ${available} ${PURITY_LABELS[purity].toLowerCase()} nodes — spread them across purities.`)
      })
    }

    return details
  }

  // Everything the plan takes out of the world, per resource, with the factories doing the taking
  // and what the world has to say about it.
  const allFactoryRawResources = computed(() => {
    const nodeUsage = calculateResourceNodeUsage(props.factories)

    return calculateTotalRawResources(props.factories).map(resource => {
      const utilisation = getResourceUtilisation(resource.id, resource.totalAmount)
      const usage = nodeUsage.find(entry => entry.id === resource.id)

      return {
        ...resource,
        utilisation,
        nodeUsage: usage,
        statuses: buildStatuses(utilisation, usage),
        details: buildDetails(utilisation, usage),
      }
    })
  })

  const problems = computed(() => calculateWorldResourceProblems(props.factories))

  const nameList = (ids: string[]) => {
    const names = ids.map(id => getPartDisplayName(id))
    if (names.length <= 1) {
      return names.join('')
    }
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  }

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('statisticsRawResourcesHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('statisticsRawResourcesHidden', value.toString())
  })
</script>

<style lang="scss" scoped>
.stats-table {
  background-color: transparent;

  // The chips column carries the width; the resource name only needs enough not to wrap.
  th:nth-child(1),
  td:nth-child(1) {
    white-space: nowrap;
    width: 1%;
  }

  // Bars need a floor to be readable at: left to itself the chips column takes the width and
  // leaves the bars a few pixels of track.
  th:nth-child(2),
  td:nth-child(2) {
    width: 1%;
    min-width: 360px;
  }

  // Label, bar, figures — one grid so every row's bar starts and ends on the same pixel, whatever
  // its label reads.
  .bar-row {
    display: grid;
    grid-template-columns: 72px minmax(70px, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 2px 0;
  }

  .bar-label {
    font-size: 0.78rem;
    color: rgb(var(--v-theme-on-surface));
    opacity: 0.7;
  }

  .bar-values {
    white-space: nowrap;
    font-size: 0.85rem;
  }

  // Indented to the bar's own column, so it reads as a footnote to the bar above rather than a
  // row of its own.
  .bar-caption {
    padding-left: 82px;
    // Wrapping splits "at 100%" onto its own line, which reads as a third bar's label rather
    // than the tail of this sentence. The column shrink-wraps, so it simply gets wider.
    white-space: nowrap;
  }

  .details {
    color: var(--sf-status-warning);
    max-width: 46ch;
    padding-left: 82px;
  }

  // v-table's default cell height assumes one line; these rows hold chips and wrap.
  td {
    padding-top: 8px !important;
    padding-bottom: 8px !important;
    height: auto !important;
  }
}
</style>
