<template>
  <!-- Animated (sidebar) keeps the wrapper mounted with no chips: the grid row is what animates,
       and a v-if would take it out of the layout so there would be nothing to grow from. Everywhere
       else it goes, or its empty box still claims a slot in the parent's flex gap. -->
  <div
    v-if="animated || chips.length"
    class="status-chips"
    :class="{ open: chips.length > 0, animated: animated && ready, stacked: animated }"
  >
    <div class="status-chips-inner" :class="[`size-${size}`, { detailed }]">
      <tooltip
        v-for="status in chips"
        :key="status.type"
        :text="tooltipFor(status)"
      >
        <v-chip
          class="sf-chip no-margin"
          :class="[size, `status-${status.severity}`, isNavigable(status) ? 'sf-chip-clickable' : 'sf-chip-info']"
          v-bind="navigateProps(status)"
        >
          <!-- Subjects get their own icons; the label carries the total, so an overflow count is
               only worth showing where the label doesn't already say it. -->
          <template v-if="iconSubjects(status).length">
            <game-asset
              v-for="subject in iconSubjects(status)"
              :key="`${status.type}-${subject.id}`"
              :height="iconSize"
              :subject="subject.id"
              :type="subject.type"
              :width="iconSize"
            />
            <span v-if="overflowCount(status)" class="ml-1">+{{ overflowCount(status) }}</span>
          </template>
          <i v-else :class="status.icon" />
          <span class="ml-2">{{ detailed ? status.detailLabel : status.label }}</span>
        </v-chip>
      </tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref } from 'vue'
  import { FactoryStatus, FactoryStatusSection, getChipStatuses } from '@/utils/factory-management/status'
  import { getPartDisplayName } from '@/utils/helpers'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import GameAsset from '@/components/GameAsset.vue'
  import Tooltip from '@/components/tooltip.vue'

  // Beyond these the chip would be wider than the header or sidebar entry it sits in.
  const MAX_DETAILED_ICONS = 6
  const MAX_CONDENSED_ICONS = 4

  const props = withDefaults(defineProps<{
    statuses?: FactoryStatus[]
    size?: 'x-small' | 'small'
    // Section headers: every subject icon plus the fuller label.
    detailed?: boolean
    // Grow/retract the row rather than snapping. Only the sidebar wants this — the card header
    // and section headers already sit in layouts that reflow.
    animated?: boolean
    // Whether @navigate is wired up. Declared emits are stripped out of $attrs, so the component
    // cannot see the listener — and a chip that looks pressable and isn't is worse than a plain
    // one. Section headers leave it off: you are already in the section it would jump to.
    navigable?: boolean
  }>(), {
    statuses: () => [],
    size: 'x-small',
    detailed: false,
    animated: false,
    navigable: false,
  })

  // The subject rides along so the jump can land on the row that owns the problem rather than on
  // the section heading above it. The parent composes the element id: only it knows the factory.
  const emit = defineEmits<{
    (event: 'navigate', target: { section: FactoryStatusSection, subject?: string }): void
  }>()

  const isNavigable = (status: FactoryStatus) => props.navigable && !!status.section

  // Bound as a whole object rather than @click, so a chip with nowhere to go gets no listener at
  // all: a bound listener is what earns a chip Vuetify's v-chip--link, and with it a tab stop and
  // Enter/Space handling it has no use for.
  const navigateProps = (status: FactoryStatus) => isNavigable(status)
    ? {
      onClick: (event: MouseEvent | KeyboardEvent) => {
        event.stopPropagation()
        emit('navigate', { section: status.section!, subject: status.subjects[0]?.id })
      },
    }
    : {}

  const chips = computed(() => getChipStatuses(props.statuses))

  const iconSize = computed(() => props.size === 'small' ? 20 : 16)

  const iconLimit = computed(() => props.detailed ? MAX_DETAILED_ICONS : MAX_CONDENSED_ICONS)

  const iconSubjects = (status: FactoryStatus) => status.subjects.slice(0, iconLimit.value)

  // Condensed labels already give the total ("5 shortages"), so only the detailed variant, whose
  // label names the subject instead, needs telling how many icons were dropped.
  const overflowCount = (status: FactoryStatus) =>
    props.detailed ? Math.max(0, status.subjects.length - MAX_DETAILED_ICONS) : 0

  const displayName = (subject: FactoryStatus['subjects'][number]) =>
    subject.type === 'building' ? getBuildingDisplayName(subject.id) : getPartDisplayName(subject.id)

  const tooltipFor = (status: FactoryStatus) => {
    if (!status.subjects.length) return status.detail
    return `${status.detail}<br><b>${status.subjects.map(displayName).join(', ')}</b>`
  }

  // Gated so a plan that loads with broken factories renders their chips already open instead of
  // playing a dozen grow animations at once. Loading a different plan gives the sidebar rows new
  // factory ids, and the draggable keys on id, so these remount and the gate resets by itself.
  const ready = ref(false)
  onMounted(() => nextTick(() => { ready.value = true }))
</script>

<style lang="scss" scoped>
// Height animation via grid-template-rows 0fr -> 1fr: the row interpolates to the content's
// natural height, which max-height cannot do without hardcoding a guess. Firefox below 121 does
// not interpolate it and simply snaps, which is what this looked like before.
.status-chips {
  display: grid;
  grid-template-rows: 0fr;

  &.open {
    grid-template-rows: 1fr;
  }

  &.animated {
    transition: grid-template-rows 0.25s ease;
  }
}

.status-chips-inner {
  // Both required, or the row refuses to collapse back to zero.
  overflow: hidden;
  min-height: 0;

  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;

  // Chips fade in once the box has finished opening, and out before it closes — the delay is on
  // the open state only, so retracting drops them immediately.
  > * {
    opacity: 0;
    transition: opacity 0.15s ease;
  }
}

// Only where the chips sit on their own line under the factory name (the sidebar) — the gutter
// keeps them off it. On a shared line it would push them 2px below the chips beside them, which is
// visible against the sync and power chips in a card header.
.status-chips.open.stacked .status-chips-inner {
  padding-top: 4px;
}

.status-chips.open .status-chips-inner {
  > * {
    opacity: 1;
    transition-delay: 0.15s;
  }
}

// x-small chips are a fixed 26px with no vertical padding; the item icons need the box to breathe.
.status-chips-inner.detailed .sf-chip,
.sf-chip.x-small {
  height: auto !important;
  padding-top: 3px !important;
  padding-bottom: 3px !important;
}
</style>
