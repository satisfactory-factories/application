<template>
  <div class="sidebar-group mb-1" :class="{ ungrouped: !group }" :style="colorVars">
    <!-- Header. Present whether open or collapsed; the product line under the title is what
         makes a collapsed group still say what is inside it. -->
    <div class="group-header" :class="{ collapsed }">
      <!-- Deliberately the biggest thing in the sidebar after the plan itself: a group is the unit
           people navigate by, and at the old size its title sat below the factory names under it. -->
      <div class="group-title-row d-flex align-center ga-2 px-2 py-2">
        <!-- data-hover-tooltip rather than `title` throughout this header, matching the expand
             button below: a group's controls are drawn once per group, so they take the one
             delegated tooltip at the app shell rather than a v-tooltip each. `aria-label` names
             the icon-only buttons that the removed `title` used to. -->
        <!-- The hint sits on a wrapper rather than the icon: FontAwesome replaces the <i> with
             an <svg>, and HoverTooltip only accepts an HTMLElement, so on the icon itself it
             never fires. (A native `title` never worked here either — SVG ignores the
             attribute.) The drag handle class stays on the icon, which is what Sortable grabs. -->
        <span
          v-if="group"
          class="d-inline-flex align-center"
          data-hover-tooltip="Drag to reorder group"
        >
          <i class="fas fa-grip-lines group-drag-handle text-grey-darken-1" />
        </span>
        <!-- Two keyed icons rather than one with a bound class: Font Awesome replaces the <i> with
             an <svg> of its own, which Vue's patch then no longer owns, so flipping the class left
             the chevron pointing down forever. A keyed element forces a fresh node. -->
        <v-btn
          :aria-label="collapsed ? 'Expand group' : 'Collapse group'"
          class="chevron"
          :data-hover-tooltip="collapsed ? 'Expand group' : 'Collapse group'"
          density="compact"
          icon
          size="small"
          variant="text"
          @click="toggle"
        >
          <span v-if="collapsed" key="shut"><i class="fas fa-chevron-right" /></span>
          <span v-else key="open"><i class="fas fa-chevron-down" /></span>
        </v-btn>

        <factory-group-color-menu
          v-if="group"
          :model-value="group.color"
          @update:model-value="setGroupColor(group.id, $event)"
        />

        <input
          v-if="group"
          v-model="draftName"
          class="group-name"
          placeholder="Group name"
          @blur="commitName"
          @keyup.enter="acceptName"
        >
        <span v-else class="group-name ungrouped-label">Ungrouped</span>

        <v-spacer />

        <v-chip class="sf-chip small no-margin factory factory-count" variant="tonal">
          <i class="fas fa-industry" />
          <span class="ml-2">{{ section.factories.length }}</span>
        </v-chip>

        <!-- Set apart from the readouts beside them: these two act, and a delete button flush
             against a count is a delete button someone reaches by accident. -->
        <div class="header-actions d-flex align-center ga-1">
          <v-btn
            :aria-label="`Show the ${groupName} factories in the summary`"
            class="expand-group"
            data-hover-tooltip="Expand this view to see more details about this group"
            density="comfortable"
            icon="fas fa-expand-alt"
            size="small"
            variant="text"
            @click.stop="openBreakdown"
          />
          <v-btn
            v-if="group"
            aria-label="Delete group"
            class="delete-group"
            color="red"
            data-hover-tooltip="Delete this group. The factories in it are kept, and go back to being ungrouped."
            density="comfortable"
            icon="fas fa-trash"
            size="small"
            variant="text"
            @click.stop="requestDelete"
          />
        </div>
      </div>

      <!-- What is wrong inside this group, in the same chips and the same order the Factories
           Summary uses for the whole plan. Under the title and above everything descriptive: a
           group in trouble should say so before it says what it makes. Absent when nothing is. -->
      <div v-if="statusTally.length" class="d-flex align-center flex-wrap ga-1 px-2 pb-1">
        <tooltip
          v-for="chip in statusTally"
          :key="chip.key"
          :text="chip.tooltip"
        >
          <v-chip class="sf-chip x-small no-margin" :class="chip.class" variant="tonal">
            <i :class="chip.icon" />
            <span class="ml-1">{{ chip.count }}</span>
          </v-chip>
        </tooltip>
      </div>

      <!-- Whether this group pays for itself: the same three chips the Statistics jump-link
           wears, at the same size, minus the target — a target belongs to the plan and a group
           cannot have one of its own. On its own line because the sidebar is narrow: beside the
           title they pushed the group's name off the end of it.  -->
      <div v-if="options.showGroupPower" class="power-row d-flex align-center flex-wrap ga-1 px-2 pb-1">
        <tooltip :text="`Power generated by this group: ${formatMw(power.produced)}`">
          <v-chip class="sf-chip x-small no-margin generation" variant="tonal">
            <i class="fas fa-bolt mr-1" /><i class="fas fa-plus" />
            <span class="ml-1">{{ formatGw(power.produced) }}</span>
          </v-chip>
        </tooltip>
        <tooltip :text="`Power consumed by this group: ${formatMw(power.consumed)}`">
          <v-chip class="sf-chip x-small no-margin consumption" variant="tonal">
            <i class="fas fa-bolt mr-1" /><i class="fas fa-minus" />
            <span class="ml-1">{{ formatGw(power.consumed) }}</span>
          </v-chip>
        </tooltip>
        <!-- Augmenters here boost the whole plan's generation, not this group's — see the band. -->
        <tooltip
          v-if="power.boost > 0"
          :text="`Alien Power Augmenters in this group add ${formatMw(power.boost)} to the grid, counted in the plan's power rather than this group's`"
        >
          <v-chip class="sf-chip x-small no-margin circuit-boost" variant="tonal">
            <i class="fas fa-bolt mr-1" /><i class="fas fa-arrow-up" />
            <span class="ml-1">{{ formatGw(power.boost) }}</span>
          </v-chip>
        </tooltip>
        <tooltip :text="`This group ${power.difference < 0 ? 'draws' : 'has a surplus of'} ${formatMw(Math.abs(power.difference))}`">
          <v-chip
            class="sf-chip x-small no-margin"
            :class="power.difference < 0 ? 'error' : 'success'"
            variant="tonal"
          >
            <i class="fas fa-balance-scale" />
            <span class="ml-1">{{ formatGw(power.difference) }}</span>
          </v-chip>
        </tooltip>
      </div>

      <!-- Second line: what this group actually makes, and whether it is keeping up. Kept to one
           line, with as many tiles on it as the sidebar's current width allows — see `fits`. -->
      <div
        v-if="options.showGroupProducts && products.length"
        ref="productRow"
        class="product-row d-flex align-start ga-1 px-2 pb-1"
      >
        <!-- One tooltip for the whole tile, carrying the name and the figure together. The icon
             marks itself for HoverTooltip, so wrapping it in a v-tooltip would give the hover two
             answers; the same text goes on the tile so the number below the icon answers too. -->
        <span
          v-for="product in visibleProducts"
          :key="product.partId"
          class="product-tile"
          :data-hover-tooltip="netTooltip(product)"
          :data-hover-tooltip-note="kindLabel(product)"
        >
          <group-product-icon
            :kind="tileKind(product)"
            :part-id="product.partId"
            :tooltip="netTooltip(product)"
          />
          <span class="product-net" :class="netClass(product.net)">{{ netLabel(product.net) }}</span>
        </span>
        <v-tooltip v-if="hiddenProducts.length" location="bottom">
          <template #activator="{ props: activatorProps }">
            <span class="overflow-count" v-bind="activatorProps">+{{ hiddenProducts.length }}</span>
          </template>
          <!-- One per line. Joined with commas this was a single wrapped paragraph of figures, and
               at 20-odd parts it filled the screen without any of it being findable. -->
          <div v-for="line in overflowTooltipLines" :key="line">{{ line }}</div>
        </v-tooltip>
      </div>
    </div>

    <!--
      Always rendered, never v-if'd away: a Sortable list that is not in the DOM is not a drop
      target, so a collapsed group could not be dropped into. Collapsed, its rows are hidden by CSS
      and the strip shows instead — a real element with real height for Sortable to aim at.
    -->
    <draggable
      class="group-body"
      :class="{ collapsed }"
      :group="{ name: 'sidebar-factories' }"
      item-key="id"
      :model-value="rows"
      @change="onChange"
      @end="draggingFactory = false"
      @start="draggingFactory = true"
    >
      <template #header>
        <div v-if="showDropStrip" class="drop-strip">
          <span v-if="collapsed">Drop here to add to {{ group?.name ?? 'Ungrouped' }}</span>
          <span v-else>Drop a factory here</span>
        </div>
      </template>
      <!-- The wrapper carries the tree: the trunk segment and the elbow into the row are drawn on
           it, leaving the row itself exactly as it renders outside a group. -->
      <template #item="{ element }">
        <div class="tree-item">
          <planner-sidebar-factory-row :factory="element" :statuses="statuses.get(element.id)" />
        </div>
      </template>
    </draggable>

    <!-- The tail of the tree, sat where the next factory in this group would appear — which is
         where the button that makes one belongs. Outside the draggable deliberately: a button
         inside a Sortable list is a row Sortable would try to reorder and drop factories after. -->
    <div class="group-footer" :class="{ collapsed }">
      <div class="add-factory">
        <!-- The elbow's long arm: an element rather than a pseudo-element because it has to end
             where the button begins, and the button is centred rather than a known width away.
             It and the spacer opposite are what centre the button between them. -->
        <span aria-hidden="true" class="branch-arm" />
        <v-btn
          class="add-factory-btn"
          color="primary"
          :data-hover-tooltip="addFactoryTooltip"
          prepend-icon="fas fa-plus"
          size="small"
          @click="requestFactory"
        >
          Add factory
        </v-btn>
        <span aria-hidden="true" class="branch-spacer" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import draggable from 'vuedraggable'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import {
    FactoryStatus,
    factoryStatusTallyChips,
    tallyFactoryStatuses,
  } from '@/utils/factory-management/status'
  import { FactoryGroupSection, UNGROUPED_ID } from '@/utils/factory-management/factory-groups'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { useGroupCollapse } from '@/composables/useGroupCollapse'
  import { useFactoryDrag } from '@/composables/useFactoryDrag'
  import { useElementWidth } from '@/composables/useElementWidth'
  import { usePlannerOptions } from '@/composables/usePlannerOptions'
  import {
    collectGroupProducts,
    GroupProduct,
    groupProductKinds,
    overflowLines,
  } from '@/utils/factory-management/group-products'
  import eventBus from '@/utils/eventBus'
  import GroupProductIcon from '@/components/planner/groups/GroupProductIcon.vue'
  import { groupColorVars } from '@/utils/colors'
  import { formatCompact, formatGw, formatMw, formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalPower } from '@/utils/statistics'
  import { getPartDisplayName } from '@/utils/helpers'
  import FactoryGroupColorMenu from '@/components/planner/groups/FactoryGroupColorMenu.vue'
  import PlannerSidebarFactoryRow from '@/components/planner/groups/PlannerSidebarFactoryRow.vue'

  const props = defineProps<{
    section: FactoryGroupSection
    statuses: Map<number, FactoryStatus[]>
  }>()

  const emit = defineEmits<{
    (event: 'delete', group: NonNullable<FactoryGroupSection['group']>): void
    // null is Ungrouped, which is a real destination: it means "make one belonging to nothing".
    (event: 'createFactory', groupId: string | null): void
  }>()

  const { renameGroup, setGroupColor, moveFactoryToGroup } = useFactoryGroups()
  const { draggingFactory } = useFactoryDrag()
  const { isCollapsed, isMounted, toggleCollapsed } = useGroupCollapse()

  const group = computed(() => props.section.group)
  const groupId = computed(() => group.value?.id ?? null)
  const collapsed = computed(() => isCollapsed(groupId.value))

  // Rows survive a collapse and are hidden instead, so reopening is a style change rather than
  // forty components being rebuilt. A group shut when the plan loads renders none of them.
  const rows = computed(() => isMounted(groupId.value) ? props.section.factories : [])

  const colorVars = computed(() =>
    group.value ? groupColorVars(group.value.color) : {}
  )

  // The strip is the group's only drop target when there are no rows to aim at — collapsed, or
  // simply empty — and an expanded empty group is otherwise zero pixels tall and cannot be dragged
  // into at all. Only while a factory is in the air, though: it is an instruction, not a
  // decoration, and Sortable measures drop targets as the pointer moves rather than at dragstart.
  const showDropStrip = computed(() =>
    draggingFactory.value && (collapsed.value || props.section.factories.length === 0)
  )

  const draftName = ref(group.value?.name ?? '')
  watch(() => group.value?.name, name => {
    if (name !== undefined) draftName.value = name
  })

  const commitName = () => {
    if (!group.value || draftName.value === group.value.name) return
    renameGroup(group.value.id, draftName.value)
  }

  // Enter has always committed, but it left the caret sitting in the field with nothing to say the
  // rename had landed — which reads as "it needs a click elsewhere". Leaving the field is the
  // feedback.
  const acceptName = (event: KeyboardEvent) => {
    commitName()
    ;(event.target as HTMLInputElement).blur()
  }

  const toggle = () => toggleCollapsed(groupId.value)

  const requestDelete = () => {
    if (group.value) emit('delete', group.value)
  }

  // Asked for rather than done here: the planner owns factory creation (it also has to navigate to
  // the new card), so this only says which group the click came from.
  const requestFactory = () => emit('createFactory', group.value?.id ?? null)

  const addFactoryTooltip = computed(() => group.value
    ? `Add a new factory to ${group.value.name}`
    : 'Add a new factory, in no group')

  // Must match the tile size and gap the template asks for, since the fit is arithmetic rather
  // than measurement: laying the icons out to find out how many fit would mean rendering the
  // overflow the count exists to avoid.
  const TILE = 36
  const GAP = 4
  // Only until the observer's first callback, which lands in the same frame as the first paint.
  const UNMEASURED_LIMIT = 8
  // Below this, a figure is float noise from a reverse-solve rather than a real imbalance — a
  // group reading "+0.0001" in red would be a lie told to three decimal places.
  const NET_EPSILON = 0.001

  const options = usePlannerOptions()

  // Reuses the parent's memo rather than re-deriving: the sidebar already holds a status list per
  // factory for the rows below.
  const statusTally = computed(() => factoryStatusTallyChips(tallyFactoryStatuses(
    props.section.factories.map(factory => props.statuses.get(factory.id) ?? [])
  )))

  // The same figures the group's band in the planner carries, so the two cannot disagree.
  const power = computed(() => {
    const totals = calculateTotalPower(props.section.factories)
    return {
      produced: totals.totalPowerProduced,
      consumed: totals.totalPowerConsumed,
      difference: totals.totalPowerDifference,
      boost: totals.totalPowerBoost,
    }
  })

  // What the group makes, with its surplus or shortfall. Parts it produces and consumes entirely
  // within itself are left off unless asked for — the row says what the folder delivers, and an
  // intermediate that never leaves it crowds that out.
  const products = computed(() => {
    const all = collectGroupProducts(props.section.factories)
    return options.value.showInternalGroupProducts ? all : all.filter(product => !product.internal)
  })

  // Zero is neither, and drawing it green would claim a group that exactly balances has headroom.
  const netClass = (net: number) => {
    if (net > NET_EPSILON) return 'surplus'
    return net < -NET_EPSILON ? 'deficit' : 'balanced'
  }

  // Magnitude only: the colour already says which side of zero it is, and the two characters a
  // sign costs are better spent on legibility at this size. The tooltip spells it out in words.
  const netLabel = (net: number) => {
    if (Math.abs(net) <= NET_EPSILON) return '0'
    return formatCompact(Math.abs(net))
  }

  // Undefined rather than a falsy string when the badges are off: the icon component draws the
  // badge only when it has a kind, and Vue drops an undefined attribute entirely.
  const tileKind = (product: GroupProduct) =>
    options.value.showGroupProductKinds ? product.kind : undefined

  const kindLabel = (product: GroupProduct) => {
    const kind = tileKind(product)
    return kind ? groupProductKinds[kind].label : undefined
  }

  const groupName = computed(() => group.value?.name ?? 'Ungrouped')

  // The whole table, narrowed to this section. Ungrouped sends the sentinel the grouping code
  // already uses for it rather than nothing at all: an expand button on a section of 4 that opened
  // all 12 factories was saying it would filter and then not doing it.
  const openBreakdown = () => eventBus.emit('openSummaryFullscreen', group.value?.id ?? UNGROUPED_ID)

  // The tile is four characters wide, so the exact figure and what it means live here.
  const netTooltip = (product: GroupProduct) => {
    const name = getPartDisplayName(product.partId)
    if (Math.abs(product.net) <= NET_EPSILON) return `${name}: balanced`
    return product.net > 0
      ? `${name}: ${formatNumber(product.net)}/min surplus`
      : `${name}: ${formatNumber(Math.abs(product.net))}/min short`
  }

  const productRow = ref<HTMLElement>()
  const { width: rowWidth } = useElementWidth(productRow)

  // n tiles need n widths and n-1 gaps, so the gap is added to both sides of the division.
  const fits = computed(() =>
    rowWidth.value ? Math.floor((rowWidth.value + GAP) / (TILE + GAP)) : UNMEASURED_LIMIT
  )

  // The +N tile occupies a slot of its own, so it is only worth showing when it hides more than
  // the one icon it displaces.
  const shownCount = computed(() =>
    products.value.length <= fits.value ? products.value.length : Math.max(fits.value - 1, 0)
  )

  const visibleProducts = computed(() => products.value.slice(0, shownCount.value))
  const hiddenProducts = computed(() => products.value.slice(shownCount.value))

  const overflowTooltipLines = computed(() => overflowLines(hiddenProducts.value.map(netTooltip)))

  // The single write. Only the destination list acts: Sortable fires `removed` on the source
  // and `added` on the target for one move, and handling both would apply it twice.
  const onChange = (event: {
    added?: { element: Factory, newIndex: number }
    moved?: { element: Factory, newIndex: number }
  }) => {
    const change = event.added ?? event.moved
    if (!change) return
    moveFactoryToGroup(
      change.element.id,
      group.value?.id ?? null,
      // A collapsed group shows no rows, so there is no meaningful slot — append.
      collapsed.value ? undefined : change.newIndex,
    )
  }
</script>

<style lang="scss" scoped>
// Tree geometry. The trunk hangs off the header and each row is indented clear of it, so the
// group reads like `tree` output rather than a run of cards with a heading over it.
$tree-indent: 18px;
$tree-line: 3px;
// Half the gutter the row's own mb-1 contributes to the wrapper, discounted so the elbow lands on
// the middle of the card rather than the middle of card-plus-gap.
$tree-gutter: 4px;
// The drop strip's dashed border, which its own tree lines have to be shifted back over.
$strip-border: 1px;

.sidebar-group {
  border-radius: 4px;
  overflow: hidden;
}

.group-header {
  position: relative;
  background-color: var(--sf-group-muted, rgba(255, 255, 255, 0.04));
  font-size: 0.9rem;

  // The top of the trunk. Same width and same x as the segments below it, so header line and
  // elbows read as one line down the group's edge. It overhangs by the body's top gutter, so the
  // breathing room under the header doesn't break the line — drawn from here rather than from the
  // first row, which would fight the last row's rule when a group holds exactly one factory.
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: -$tree-gutter;
    width: $tree-line;
    background-color: var(--sf-group, #616161);
  }

  // Shut, the header is the whole group: the trunk has nothing to run down to, so it would hang
  // 4px into the gap below, and the wrapper's radius only clips corners a child actually reaches.
  &.collapsed {
    border-radius: 4px;

    &::before {
      bottom: 0;
      border-bottom-left-radius: 4px;
    }
  }
}

.group-drag-handle {
  cursor: grab;
}

// A big glyph in a tight box: the default was the other way round, which read as a stray icon
// floating in a lot of empty button.
.chevron {
  font-size: 1.1rem;
}

.group-name {
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 1.05rem;
  font-weight: 600;
  min-width: 0;
  flex: 1 1 auto;

  &:focus {
    border-bottom: 1px solid rgba(255, 255, 255, 0.5);
  }
}

// Never shrinks: the header is a flex row, and once the group name filled it the chip was the
// item that gave way — two digits then clipped against its own border. Padding is the chip's own
// symmetric 10px, with a single ml-2 setting the number apart from the icon.
.factory-count {
  flex: 0 0 auto;
}

// The count sits close to the buttons; the separation that matters is between the two buttons, so
// that delete is not the thing a thumb aimed at expand lands on.
.header-actions {
  margin-left: 2px;
}

.expand-group {
  margin-right: 6px;
}

.ungrouped-label {
  color: #bdbdbd;
  font-style: italic;
}

.group-body {
  // The same gutter the rows keep between themselves, so the header doesn't sit flush on the
  // first one. The header's trunk bridges it.
  padding: $tree-gutter 0 0 $tree-indent;
}

// Collapsed hides the rows rather than dropping them — see `rows` above. The strip stays.
.group-body.collapsed {
  min-height: 0;
  // Nothing under the header to keep clear of, so the gutter would be dead space below the group.
  padding-top: 0;

  .tree-item {
    display: none;
  }
}

.tree-item {
  position: relative;
  // Contains the row's own bottom margin, so consecutive trunk segments meet instead of leaving a
  // gap the height of the gutter between rows.
  display: flow-root;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: -$tree-indent;
    background-color: var(--sf-group, #616161);
  }

  // Trunk, one segment per row. The last row ends it at its own elbow, giving the corner.
  &::before {
    top: 0;
    bottom: 0;
    width: $tree-line;
  }

  // Elbow, reaching from the trunk to the row's left edge. Level with the middle of the row, not
  // its first line — a row carrying status chips is two lines tall, and an elbow pinned to the top
  // one points at nothing in particular.
  &::after {
    top: calc(50% - #{$tree-gutter * 0.5} - #{$tree-line * 0.5});
    width: $tree-indent;
    height: $tree-line;
  }
}

// The tree's terminator, and the group's own Add Factory. It hangs off the trunk one slot below
// the last row, so the tree ends on the button rather than on the last factory with a button
// floating under it.
.group-footer {
  padding: 0 0 $tree-gutter $tree-indent;

  // Collapsed, the rows are hidden and the header is the whole group; a lone "add a factory"
  // hanging under a shut group would be the only thing left in the body.
  &.collapsed {
    display: none;
  }
}

// The elbow reaches the button from the side, exactly as it reaches a factory row — the button is
// simply further along, being centred. The trunk and the stub across the indent are drawn here;
// the arm covering the rest of the distance has to be an element (see the template).
.add-factory {
  position: relative;
  display: flex;
  align-items: center;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: -$tree-indent;
    background-color: var(--sf-group, #616161);
  }

  // Trunk, ending at its own elbow: nothing follows it.
  &::before {
    top: 0;
    height: calc(50% + #{$tree-line * 0.5});
    width: $tree-line;
  }

  // The elbow's first stub, across the indent the rows are inset by. The arm carries on from
  // where this ends, so the two read as one line.
  &::after {
    top: calc(50% - #{$tree-line * 0.5});
    width: $tree-indent;
    height: $tree-line;
  }
}

.branch-arm {
  flex: 1 1 0;
  height: $tree-line;
  background-color: var(--sf-group, #616161);
}

// Nothing but the arm's opposite number: equal flex either side is what holds the button in the
// middle while the arm takes whatever room is left to the left of it.
.branch-spacer {
  flex: 1 1 0;
}

// The "overlay over the group you could be entering" — the element Sortable actually measures
// when there is no row to aim at. It hangs off the trunk exactly as a row does, so a group with
// nothing in it still reads as part of the tree rather than as a panel below it.
.drop-strip {
  position: relative;
  margin: 0 0 6px;
  padding: 6px;
  border: $strip-border dashed var(--sf-group, #777);
  border-radius: 4px;
  text-align: center;
  font-size: 0.72rem;
  color: #bdbdbd;
  transition: background-color 0.15s ease;

  // Everything below is offset by the strip's own border: an absolutely positioned child measures
  // from the PADDING box, so without this the trunk and elbow sit 1px right of the header's line
  // and the join reads as a stair-step.
  &::before,
  &::after {
    content: '';
    position: absolute;
    left: -($tree-indent + $strip-border);
    background-color: var(--sf-group, #616161);
  }

  // Nothing follows it, so its trunk always ends at its own elbow.
  &::before {
    top: -($tree-gutter + $strip-border);
    height: calc(50% + #{$tree-gutter + $strip-border} + #{$tree-line * 0.5});
    width: $tree-line;
  }

  &::after {
    top: calc(50% - #{$tree-line * 0.5});
    width: $tree-indent + $strip-border;
    height: $tree-line;
  }
}

.group-body.collapsed:hover .drop-strip {
  background-color: var(--sf-group-muted, rgba(255, 255, 255, 0.08));
}

/* One line, never wrapped: the count is calculated to fit, so wrapping would only ever be the
   symptom of a miscalculation — and a hidden overflow says so quietly instead of shoving the
   whole sidebar down a row. */
.product-row {
  min-width: 0;
  overflow: hidden;

  > * {
    flex: 0 0 auto;
  }
}

/* Fixed to the icon's width so the fit arithmetic keeps holding — the figure is centred under it
   and allowed to be the wider of the two rather than widening the tile. */
.product-tile {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 36px;
  cursor: default;
}

.product-net {
  margin-top: 1px;
  /* As large as four characters fit into the icon's 36px, now the sign is gone. */
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;

  &.surplus {
    color: var(--sf-success);
  }

  &.deficit {
    color: var(--sf-problem);
  }

  /* Exactly balanced is neither good nor bad, and colouring it either way would say something
     the number does not. */
  &.balanced {
    color: #9e9e9e;
  }
}

.overflow-count {
  /* Pinned to the right edge, so the slack a whole tile never fits into sits between the icons
     and the count rather than trailing after it. */
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 4px;
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.14);
  font-size: 0.8rem;
  cursor: default;
}
</style>
