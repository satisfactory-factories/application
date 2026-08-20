<template>
  <div class="d-flex align-center flex-wrap">
    <h4 class="text-h4" :class="{ 'text-red': problems.blockers > 0 }">
      <i class="fas fa-globe" />
      <span class="ml-3">Raw Resources</span>
    </h4>
    <v-chip
      v-if="allFactoryRawResources.length > 0"
      id="stats-raw-resources-summary"
      class="sf-chip raw-resource small ml-3"
      variant="tonal"
    >
      {{ allFactoryRawResources.length }} {{ allFactoryRawResources.length === 1 ? 'resource' : 'resources' }}
    </v-chip>
    <!-- The section can be collapsed, and is on a returning visitor, so the header has to be able
         to say something inside it is wrong on its own. -->
    <v-chip
      v-if="problems.blockers > 0"
      id="stats-raw-resources-problems"
      class="sf-chip status-problem small ml-2"
      variant="flat"
    >
      <i class="fas fa-exclamation-triangle" />
      <span class="ml-2">{{ problems.blockers }} beyond the map</span>
    </v-chip>
    <v-chip
      v-if="problems.needsOverclock.length > 0"
      id="stats-raw-resources-shards"
      class="sf-chip status-warning small ml-2"
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
          <th class="text-right">Extraction</th>
          <th class="text-center">Nodes</th>
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
          </td>
          <!-- Taken over the most the world can give, with the machine that ceiling assumes named
               under it: "12,600/min at 250%" is meaningless without knowing whether that is a
               Mk.1 or a Mk.3 standing on every node. -->
          <td class="text-right">
            <template v-if="!resource.utilisation">
              <span class="text-medium-emphasis">&mdash;</span>
            </template>
            <template v-else-if="resource.utilisation.status === 'unlimited'">
              <b>{{ formatNumber(resource.totalAmount) }}</b>/min
              <div class="text-caption text-medium-emphasis">of unlimited</div>
            </template>
            <template v-else>
              <div class="d-flex align-center justify-end ga-2">
                <span>
                  <b>{{ formatNumber(resource.totalAmount) }}</b>
                  <span class="text-medium-emphasis"> / {{ formatNumber(resource.utilisation.capacity.atMaxClock) }}</span>/min
                </span>
                <v-chip
                  class="sf-chip no-margin x-small"
                  :class="chipClass(resource.severity)"
                  variant="tonal"
                >
                  <b>{{ formatPercent(resource.utilisation.ofMaxClock) }}</b>
                </v-chip>
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ getBuildingDisplayName(resource.utilisation.capacity.extractor) }} at 250%
                &middot; {{ formatNumber(resource.utilisation.capacity.atStandardClock) }}/min at 100%
              </div>
              <div v-if="resource.warnings.length > 0" class="warnings text-caption mt-1">
                <div v-for="warning in resource.warnings" :key="warning">{{ warning }}</div>
              </div>
            </template>
          </td>
          <!-- Extractors placed against nodes that exist. The rate ceiling beside it cannot make
               this check: purity is picked per building group, so a plan can sit well inside the
               rate and still put 24 miners on 17 nodes. -->
          <td class="text-center">
            <template v-if="!resource.nodeUsage">
              <span class="text-medium-emphasis">&mdash;</span>
            </template>
            <template v-else>
              <div v-if="totalNodes(resource.nodeUsage.nodesAvailable) > 0">
                <v-chip
                  class="sf-chip no-margin x-small"
                  :class="chipClass(nodeSeverity(resource.nodeUsage.nodesUsed, resource.nodeUsage.nodesAvailable))"
                  variant="tonal"
                >
                  <b>{{ formatNumber(totalNodes(resource.nodeUsage.nodesUsed)) }} / {{ totalNodes(resource.nodeUsage.nodesAvailable) }}</b>
                </v-chip>
                <div class="text-caption text-medium-emphasis">nodes</div>
              </div>
              <!-- Only where wells are actually in play: every oil plan would otherwise carry a
                   "0 / 18 well nodes" row saying nothing. -->
              <div
                v-if="totalNodes(resource.nodeUsage.satellitesUsed) > 0 || totalNodes(resource.nodeUsage.nodesAvailable) === 0"
                class="mt-1"
              >
                <v-chip
                  class="sf-chip no-margin x-small"
                  :class="chipClass(nodeSeverity(resource.nodeUsage.satellitesUsed, resource.nodeUsage.satellitesAvailable))"
                  variant="tonal"
                >
                  <b>{{ formatNumber(totalNodes(resource.nodeUsage.satellitesUsed)) }} / {{ totalNodes(resource.nodeUsage.satellitesAvailable) }}</b>
                </v-chip>
                <div class="text-caption text-medium-emphasis">well nodes</div>
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
  import { formatNumber } from '@/utils/numberFormatter'
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
    ResourceUtilisationStatus,
    totalNodes,
  } from '@/utils/world-resources'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const formatPercent = (fraction: number) => `${formatNumber(Math.round(fraction * 100))}%`

  /**
   * What the plan takes, against what the world holds.
   *
   * The two checks are deliberately separate. The rate check asks whether the resource exists in
   * that quantity; the node check asks whether the extractors fit, and a plan can pass the first
   * and fail the second — purity is picked per building group, so nothing stops a plan describing
   * more pure nodes than the map has while every total still balances.
   */
  const buildWarnings = (
    utilisation: ResourceUtilisation | undefined,
    nodeUsage: ResourceNodeUsage | undefined,
  ): string[] => {
    const warnings: string[] = []
    if (!utilisation || utilisation.status === 'unlimited') {
      return warnings
    }

    if (utilisation.status === 'impossible') {
      const over = utilisation.amount - utilisation.capacity.atMaxClock
      warnings.push(`${formatNumber(over)}/min beyond every node at the 250% cap.`)
      warnings.push(utilisation.conversionRecipes.length > 0
        // Naming the recipes matters: it is the difference between "give up" and "this is the
        // Converter recipe that gets you the rest".
        ? `Needs the Converter: ${utilisation.conversionRecipes.join(', ')}.`
        : 'No Converter recipe makes this — the map total is final.')
    } else if (utilisation.status === 'needsOverclock') {
      warnings.push(`Over the ${formatNumber(utilisation.capacity.atStandardClock)}/min the nodes give unclocked — needs power shards.`)
    }

    if (nodeUsage?.overcommitted) {
      // Nodes and well satellites are reported apart, because they are: an Oil Extractor cannot
      // be moved onto a well's micro-node, so summing the two would offer a way out that the
      // game does not have.
      if (totalNodes(nodeUsage.nodesUsed) > totalNodes(nodeUsage.nodesAvailable)) {
        warnings.push(`${totalNodes(nodeUsage.nodesUsed)} extractors placed — the map has ${totalNodes(nodeUsage.nodesAvailable)} nodes.`)
      }
      if (totalNodes(nodeUsage.satellitesUsed) > totalNodes(nodeUsage.satellitesAvailable)) {
        warnings.push(`${totalNodes(nodeUsage.satellitesUsed)} satellites placed — the wells hold ${totalNodes(nodeUsage.satellitesAvailable)} micro-nodes.`)
      }
    } else {
      // The soft case: enough nodes exist, just not of the purity the groups name. A group
      // defaults to a normal node, so this is usually a plan that has not described its
      // purities yet rather than one that is wrong.
      nodeUsage?.overcommittedPurities.forEach(purity => {
        const used = nodeUsage.nodesUsed[purity] + nodeUsage.satellitesUsed[purity]
        const available = nodeUsage.nodesAvailable[purity] + nodeUsage.satellitesAvailable[purity]
        warnings.push(`${used} on ${available} ${PURITY_LABELS[purity].toLowerCase()} nodes — spread them across purities.`)
      })
    }

    return warnings
  }

  // Everything the plan takes out of the world, per resource, with the factories doing the taking
  // and what the world has to say about it.
  const allFactoryRawResources = computed(() => {
    const nodeUsage = calculateResourceNodeUsage(props.factories)

    return calculateTotalRawResources(props.factories).map(resource => {
      const utilisation = getResourceUtilisation(resource.id, resource.totalAmount)
      const usage = nodeUsage.find(entry => entry.id === resource.id)

      // The row's worst finding, not just its rate: a resource inside the rate ceiling with more
      // extractors than nodes is still a blocker, and a green chip over that reads as fine.
      const severity: ResourceUtilisationStatus = usage?.overcommitted && utilisation
        ? 'impossible'
        : (utilisation?.status ?? 'ok')

      return {
        ...resource,
        utilisation,
        nodeUsage: usage,
        severity,
        warnings: buildWarnings(utilisation, usage),
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

  const nodeSeverity = (used: NodeCounts, available: NodeCounts): ResourceUtilisationStatus =>
    totalNodes(used) > totalNodes(available) ? 'impossible' : 'ok'

  const chipClass = (status: ResourceUtilisationStatus) => ({
    green: status === 'ok',
    'status-warning-outlined': status === 'needsOverclock',
    error: status === 'impossible',
  })

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

  // The chips column carries the width; the others only need enough not to wrap their own
  // contents, or a plan with one long factory name squeezes the resource name onto two lines.
  th:nth-child(1),
  td:nth-child(1),
  th:nth-child(3),
  td:nth-child(3) {
    white-space: nowrap;
    width: 1%;
  }

  // The extraction column carries the figures, the ceiling they are measured against and any
  // warnings, so it needs a floor to stand on — the chips column would otherwise take the width
  // and wrap the warnings to a word a line.
  th:nth-child(2),
  td:nth-child(2) {
    width: 1%;
    min-width: 290px;
  }

  // Warning lines sit under the figures and are secondary to them, but must stay legible against
  // the table's own muted text — they are the reason the row is coloured.
  .warnings {
    color: var(--sf-status-warning);
    max-width: 40ch;
    margin-left: auto;
  }

  // v-table's default cell height assumes one line; these rows hold chips and wrap.
  td {
    padding-top: 6px !important;
    padding-bottom: 6px !important;
    height: auto !important;
  }
}
</style>
