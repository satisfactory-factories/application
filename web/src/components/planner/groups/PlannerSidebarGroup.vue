<template>
  <div class="sidebar-group mb-1" :class="{ ungrouped: !group }" :style="colorVars">
    <!-- Header. Present whether open or collapsed; the product line under the title is what
         makes a collapsed group still say what is inside it. -->
    <div class="group-header" :class="{ collapsed }">
      <div class="d-flex align-center ga-1 px-2 py-1">
        <i
          v-if="group"
          class="fas fa-grip-lines group-drag-handle text-grey-darken-1"
          title="Drag to reorder group"
        />
        <!-- Two keyed icons rather than one with a bound class: Font Awesome replaces the <i> with
             an <svg> of its own, which Vue's patch then no longer owns, so flipping the class left
             the chevron pointing down forever. A keyed element forces a fresh node. -->
        <v-btn
          class="chevron"
          density="compact"
          icon
          size="small"
          :title="collapsed ? 'Expand group' : 'Collapse group'"
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
          @keyup.enter="commitName"
        >
        <span v-else class="group-name ungrouped-label">Ungrouped</span>

        <v-spacer />

        <v-chip class="sf-chip x-small no-margin factory" variant="tonal">
          <i class="fas fa-industry" />
          <span class="ml-1">{{ section.factories.length }}</span>
        </v-chip>

        <v-btn
          v-if="group"
          class="delete-group"
          color="red"
          density="compact"
          icon="fas fa-trash"
          size="x-small"
          title="Delete group"
          variant="text"
          @click.stop="requestDelete"
        />
      </div>

      <!-- Second line: what this group actually makes. Kept to one line, with as many icons on it
           as the sidebar's current width allows — see `fits`. -->
      <div v-if="products.length" ref="productRow" class="product-row d-flex align-center ga-1 px-2 pb-1">
        <game-asset
          v-for="part in visibleProducts"
          :key="part"
          height="36"
          :subject="part"
          type="item"
          width="36"
        />
        <v-tooltip v-if="hiddenProducts.length" location="bottom">
          <template #activator="{ props: activatorProps }">
            <span class="overflow-count" v-bind="activatorProps">+{{ hiddenProducts.length }}</span>
          </template>
          <span>{{ hiddenProducts.map(getPartDisplayName).join(', ') }}</span>
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
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import draggable from 'vuedraggable'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { FactoryStatus } from '@/utils/factory-management/status'
  import { FactoryGroupSection } from '@/utils/factory-management/factory-groups'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { useGroupCollapse } from '@/composables/useGroupCollapse'
  import { useFactoryDrag } from '@/composables/useFactoryDrag'
  import { useElementWidth } from '@/composables/useElementWidth'
  import { groupColorVars } from '@/utils/colors'
  import { getPartDisplayName } from '@/utils/helpers'
  import FactoryGroupColorMenu from '@/components/planner/groups/FactoryGroupColorMenu.vue'
  import PlannerSidebarFactoryRow from '@/components/planner/groups/PlannerSidebarFactoryRow.vue'

  const props = defineProps<{
    section: FactoryGroupSection
    statuses: Map<number, FactoryStatus[]>
  }>()

  const emit = defineEmits<{
    (event: 'delete', group: NonNullable<FactoryGroupSection['group']>): void
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

  const toggle = () => toggleCollapsed(groupId.value)

  const requestDelete = () => {
    if (group.value) emit('delete', group.value)
  }

  // Must match the tile size and gap the template asks for, since the fit is arithmetic rather
  // than measurement: laying the icons out to find out how many fit would mean rendering the
  // overflow the count exists to avoid.
  const TILE = 36
  const GAP = 4
  // Only until the observer's first callback, which lands in the same frame as the first paint.
  const UNMEASURED_LIMIT = 8

  // What the group makes, deduped across its factories and in the order the factories declare
  // them, so the icons stay put as the plan changes rather than reshuffling on every recalc.
  const products = computed(() => {
    const seen = new Set<string>()
    for (const factory of props.section.factories) {
      for (const product of factory.products) {
        seen.add(product.id)
      }
    }
    return [...seen]
  })

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
  font-weight: 500;
  min-width: 0;
  flex: 1 1 auto;

  &:focus {
    border-bottom: 1px solid rgba(255, 255, 255, 0.5);
  }
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

  &:last-child::before {
    bottom: auto;
    height: calc(50% - #{$tree-gutter * 0.5} + #{$tree-line * 0.5});
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

.overflow-count {
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
