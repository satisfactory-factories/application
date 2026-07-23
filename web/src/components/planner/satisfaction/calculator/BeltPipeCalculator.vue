<template>
  <v-row class="ma-0" dense>
    <v-col
      v-for="group in groups"
      :key="group.id"
      class="transport-group-col"
      cols="12"
      lg="3"
      md="4"
      sm="6"
    >
      <div class="d-flex align-center justify-center mb-2">
        <v-btn-toggle
          v-model="group.mark"
          color="primary"
          density="comfortable"
          divided
          mandatory
          variant="outlined"
        >
          <v-btn
            v-for="mark in marks"
            :key="mark"
            class="px-2"
            size="small"
            :value="mark"
          >
            <tooltip :text="`Mk.${mark} (${speeds[mark]} ${unit})`">
              <game-asset :subject="`${iconPrefix}${mark}`" type="building" />
            </tooltip>
          </v-btn>
        </v-btn-toggle>
      </div>
      <div class="d-flex align-center justify-center">
        <v-chip class="sf-chip input unit blue" variant="tonal">
          <tooltip :text="`${getPartDisplayName(request.part)} (${unit})`">
            <game-asset clickable :subject="request.part" type="item" />
          </tooltip>
          <v-number-input
            class="inline-inputs ml-0 amount-input"
            control-variant="stacked"
            density="compact"
            hide-details
            :min="0"
            :model-value="group.amount"
            width="110px"
            @update:model-value="setGroupAmount(group, $event)"
          />
        </v-chip>
      </div>
      <div class="text-center text-caption my-1">OR</div>
      <div class="d-flex align-center justify-center">
        <v-chip class="sf-chip input unit" variant="tonal">
          <tooltip :text="`Whole Mk.${group.mark} ${nounPlural.toLowerCase()} to build`">
            <game-asset :subject="`${iconPrefix}${group.mark}`" type="building" />
          </tooltip>
          <v-number-input
            class="inline-inputs ml-0 count-input"
            control-variant="stacked"
            density="compact"
            hide-details
            :min="0"
            :model-value="wholeCount(group)"
            width="80px"
            @update:model-value="setGroupCount(group, $event)"
          />
        </v-chip>
        <v-btn
          v-if="groups.length > 1"
          class="ml-2"
          color="red rounded"
          icon="fas fa-trash"
          size="small"
          :title="`Delete ${nounSingular.toLowerCase()} group`"
          variant="outlined"
          @click="deleteGroup(group.id)"
        />
      </div>
    </v-col>
  </v-row>
  <div class="d-flex align-center px-2 mt-2">
    <v-btn color="primary" density="comfortable" variant="outlined" @click="addGroup">
      <i class="fas fa-plus" /><span class="ml-2">{{ nounSingular }} group</span>
    </v-btn>
    <v-btn
      v-if="groups.length > 1"
      class="ml-2"
      color="secondary"
      density="comfortable"
      variant="outlined"
      @click="splitEvenly"
    >
      <i class="fas fa-balance-scale" /><span class="ml-2">Split evenly</span>
    </v-btn>
    <v-chip v-if="allocationMismatch" class="ml-2" color="red">
      <i class="fas fa-exclamation-triangle" />
      <span class="ml-2">{{ nounSingular }} groups carry {{ formatNumber(allocatedAmount) }}/min of the {{ formatNumber(request.amount) }}/min exported</span>
    </v-chip>
    <v-chip v-else-if="redundantGroupCount > 0" class="ml-2" color="orange">
      <i class="fas fa-exclamation-triangle" />
      <span class="ml-2">{{ redundantGroupsMessage }}</span>
    </v-chip>
    <v-chip v-else class="ml-2" color="green">
      <i class="fas fa-check" />
      <span class="ml-2">All good</span>
    </v-chip>
    <template v-if="groups.length > 1">
      <v-chip v-for="total in markTotals" :key="total.mark" class="ml-2">
        <game-asset :subject="`${iconPrefix}${total.mark}`" type="building" />
        <span class="ml-2">Mk.{{ total.mark }}: <b>{{ total.count }}</b></span>
      </v-chip>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { ExportCalculatorFactorySettings, ExportCalculatorTransportGroup, FactoryDependencyRequest } from '@/interfaces/planner/FactoryInterface'
  import {
    addTransportGroup,
    calculateWholeTransportGroupCount,
    deleteTransportGroup,
    getRedundantTransportGroupCount,
    getTransportGroupsAllocated,
    initializeTransportGroups,
    splitTransportGroupsEvenly,
    transportGroupCapacity,
    TransportGroupKind,
    transportGroupMarks,
    transportGroupSpeeds,
  } from '@/utils/factory-management/exportCalculator'
  import { formatNumber } from '@/utils/numberFormatter'
  import { getPartDisplayName } from '@/utils/helpers'

  const props = defineProps<{
    request: FactoryDependencyRequest
    factorySettings: ExportCalculatorFactorySettings
    kind: TransportGroupKind
  }>()

  const marks = transportGroupMarks(props.kind)
  const speeds = transportGroupSpeeds(props.kind)
  const iconPrefix = props.kind === 'pipes' ? 'pipeline-mk-' : 'conveyor-belt-mk-'
  const nounSingular = props.kind === 'pipes' ? 'Pipe' : 'Belt'
  const nounPlural = props.kind === 'pipes' ? 'Pipes' : 'Belts'
  const unit = props.kind === 'pipes' ? 'm³/min' : 'Items/min'

  initializeTransportGroups(props.factorySettings, props.request.amount, props.kind)

  const groups = computed(() => (props.kind === 'pipes' ? props.factorySettings.pipeGroups : props.factorySettings.beltGroups) ?? [])

  // A lone group tracks the export amount, but never downwards on open — a deliberately
  // over-provisioned belt/pipe count (amount = capacity above the export) must survive reopening.
  if (groups.value.length === 1 && groups.value[0].amount < props.request.amount) {
    groups.value[0].amount = props.request.amount
  }
  watch(() => props.request.amount, amount => {
    if (groups.value.length === 1) {
      groups.value[0].amount = amount
    }
  })

  const allocatedAmount = computed(() => getTransportGroupsAllocated(props.factorySettings, props.kind))
  // Over-provisioning (more belt/pipe capacity than the export needs) is fine; only undercapacity warns.
  const allocationMismatch = computed(() => allocatedAmount.value < props.request.amount - 0.01)

  // Headroom is sanctioned, but a group the export fits entirely without gets an amber nudge.
  const redundantGroupCount = computed(() => getRedundantTransportGroupCount(props.factorySettings, props.request.amount, props.kind))
  const redundantGroupsMessage = computed(() => {
    const noun = nounSingular.toLowerCase()
    if (redundantGroupCount.value === groups.value.length - 1) {
      return `Redundant ${noun} groups — one group's capacity covers the whole export`
    }
    if (redundantGroupCount.value === 1) {
      return `1 ${noun} group is redundant — the export fits without it`
    }
    return `${redundantGroupCount.value} ${noun} groups are redundant — the export fits without them`
  })

  const wholeCount = (group: ExportCalculatorTransportGroup) => {
    return calculateWholeTransportGroupCount(group.amount, group.mark, props.kind)
  }

  const setGroupAmount = (group: ExportCalculatorTransportGroup, amount: number | null) => {
    if (amount == null || Number.isNaN(amount) || amount < 0) return
    group.amount = amount
  }

  // Entering a belt/pipe count means "I'm building this many" — the group carries their full capacity.
  // 0 is a valid count (an empty group, e.g. freshly added with the export already fully allocated);
  // the input's min must also be 0, or Vuetify clamp-corrects the model upwards and overwrites the amount.
  const setGroupCount = (group: ExportCalculatorTransportGroup, count: number | null) => {
    if (count == null || Number.isNaN(count) || count < 0) return
    group.amount = transportGroupCapacity(count, group.mark, props.kind)
  }

  // Whole belts/pipes to build per mark, summed across the groups of that mark.
  const markTotals = computed(() => {
    const totals: Record<number, number> = {}
    for (const group of groups.value) {
      totals[group.mark] = (totals[group.mark] ?? 0) + wholeCount(group)
    }
    return Object.entries(totals)
      .map(([mark, count]) => ({ mark: Number(mark), count }))
      .sort((a, b) => a.mark - b.mark)
  })

  const addGroup = () => addTransportGroup(props.factorySettings, props.request.amount, props.kind)
  const deleteGroup = (groupId: number) => deleteTransportGroup(props.factorySettings, groupId, props.request.amount, props.kind)
  const splitEvenly = () => splitTransportGroupsEvenly(props.factorySettings, props.request.amount, props.kind)
</script>

<style lang="scss" scoped>
// Same divider as the Export Calculator's transport columns.
$divider: thin solid #4b4b4b;

.transport-group-col + .transport-group-col {
  border-left: $divider;
}

// No divider on the first column of each wrapped row, per breakpoint (4 / 3 / 2 per row).
@media (min-width: 1280px) {
  .transport-group-col:nth-child(4n+1) {
    border-left: none;
  }
}

@media (min-width: 960px) and (max-width: 1279.98px) {
  .transport-group-col:nth-child(3n+1) {
    border-left: none;
  }
}

@media (min-width: 600px) and (max-width: 959.98px) {
  .transport-group-col:nth-child(2n+1) {
    border-left: none;
  }
}

@media (max-width: 599.98px) {
  .transport-group-col {
    border-left: none;
  }
}
</style>
