<template>
  <div class="d-flex align-center">
    <h4 class="text-h4">
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
      <i class="fas fa-info-circle" /> Shows how much of each raw resource your plan takes out of
      the world: everything your factories mine, pump or extract. "World has" is every node on the
      map worked by the best extractor with no power shards; the figure under it is the same nodes
      at the 250% clock cap, which nothing can exceed. Both assume the default vanilla world —
      1.2's randomised worlds and the resource-rich game modes deal different node counts.
    </p>
    <v-alert
      v-if="unbuildable"
      id="stats-raw-resources-alert"
      class="mb-4"
      density="compact"
      type="error"
      variant="tonal"
    >
      <b>Parts of this plan cannot be built on the map.</b>
      <div v-if="overRate.length > 0">
        The world does not hold as much {{ overRateNames }} as the plan takes, however the
        extractors are clocked.
      </div>
      <div v-if="overNodes.length > 0">
        More extractors are placed than there are nodes to stand on
        for {{ overNodeNames }}.
      </div>
    </v-alert>
    <v-table v-if="allFactoryRawResources.length > 0" id="stats-raw-resources" class="stats-table" density="compact">
      <thead>
        <tr>
          <th>Resource</th>
          <th class="text-right">Extracted</th>
          <th class="text-right">World has</th>
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
          </td>
          <td class="text-right"><b>{{ formatNumber(resource.totalAmount) }}</b>/min</td>
          <!-- Two ceilings, because they answer different questions: what the nodes give as
               built, and the wall past which the resource is not on the map at all. -->
          <td class="text-right">
            <template v-if="!resource.utilisation">
              <span class="text-medium-emphasis">&mdash;</span>
            </template>
            <template v-else-if="resource.utilisation.status === 'unlimited'">
              <span class="text-medium-emphasis">Unlimited</span>
            </template>
            <template v-else>
              <b>{{ formatNumber(resource.utilisation.capacity.atStandardClock) }}</b>/min
              <div class="text-caption text-medium-emphasis">
                {{ formatNumber(resource.utilisation.capacity.atMaxClock) }} at 250%
              </div>
            </template>
          </td>
          <td>
            <template v-if="resource.utilisation && resource.utilisation.status !== 'unlimited'">
              <v-chip
                class="sf-chip no-margin"
                :class="utilisationChipClass(resource.severity)"
                variant="tonal"
              >
                <b>{{ formatPercent(resource.utilisation.ofStandardClock) }}</b>
              </v-chip>
              <div v-if="resource.warnings.length > 0" class="warnings text-caption mt-1">
                <div v-for="warning in resource.warnings" :key="warning">{{ warning }}</div>
              </div>
            </template>
            <span v-else class="text-medium-emphasis">&mdash;</span>
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
  import { PURITY_LABELS } from '@/utils/factory-management/building-groups/extraction'
  import {
    calculateResourceNodeUsage,
    getResourceUtilisation,
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
      warnings.push(`Over what ${utilisation.capacity.extractionPoints} nodes give unclocked — needs power shards.`)
    }

    // Reported whatever the rate says: too many extractors for the nodes is its own impossibility,
    // and a plan can be well inside the rate ceiling while placing miners that have nowhere to go.
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
      // The soft case: enough nodes exist, just not of the purity the groups say. A group defaults
      // to a normal node, so this is usually a plan that has not described its purities yet.
      nodeUsage?.overcommittedPurities.forEach(purity => {
        const used = nodeUsage.nodesUsed[purity] + nodeUsage.satellitesUsed[purity]
        const available = nodeUsage.nodesAvailable[purity] + nodeUsage.satellitesAvailable[purity]
        warnings.push(`${used} extractors on ${available} ${PURITY_LABELS[purity].toLowerCase()} nodes — spread them across purities.`)
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

  // The two ways a plan can be unbuildable are called out above the table rather than left to a
  // reader scanning every row for a red chip — and kept apart, because they are different
  // problems with different fixes: one is a quantity the world does not hold, the other is
  // extractors with nowhere to stand.
  const nameList = (resources: { id: string }[]) => {
    const names = resources.map(resource => getPartDisplayName(resource.id))
    if (names.length <= 1) {
      return names.join('')
    }
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  }

  const overRate = computed(() =>
    allFactoryRawResources.value.filter(resource => resource.utilisation?.status === 'impossible')
  )
  const overNodes = computed(() =>
    allFactoryRawResources.value.filter(resource => resource.nodeUsage?.overcommitted)
  )
  const unbuildable = computed(() => overRate.value.length > 0 || overNodes.value.length > 0)

  const overRateNames = computed(() => nameList(overRate.value))
  const overNodeNames = computed(() => nameList(overNodes.value))

  const utilisationChipClass = (status: ResourceUtilisationStatus) => ({
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

  // The chips column carries the width; the first two only need enough not to wrap their own
  // contents, or a plan with one long factory name squeezes the resource name onto two lines.
  th:nth-child(1),
  td:nth-child(1),
  th:nth-child(2),
  td:nth-child(2) {
    white-space: nowrap;
    width: 1%;
  }

  // The capacity column reads as one figure over another, so it never needs to wrap.
  th:nth-child(3),
  td:nth-child(3) {
    white-space: nowrap;
    width: 1%;
  }

  // Warning lines sit under the utilisation chip and are secondary to it, but must stay legible
  // against the table's own muted text — they are the reason the row is coloured. Given a floor
  // to sit on, since the chips column would otherwise take the width and wrap these to a word
  // per line.
  td:nth-child(4) {
    min-width: 250px;
  }

  .warnings {
    color: var(--sf-status-warning);
    max-width: 34ch;
  }

  // v-table's default cell height assumes one line; these rows hold chips and wrap.
  td {
    padding-top: 6px !important;
    padding-bottom: 6px !important;
    height: auto !important;
  }
}
</style>
