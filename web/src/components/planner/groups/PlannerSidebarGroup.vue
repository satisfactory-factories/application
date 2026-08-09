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
        <v-btn
          class="chevron"
          density="compact"
          :icon="collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-down'"
          size="x-small"
          :title="collapsed ? 'Expand group' : 'Collapse group'"
          variant="text"
          @click="toggle"
        />

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

      <!-- Second line: what this group actually makes. -->
      <div v-if="visibleProducts.length" class="d-flex align-center flex-wrap ga-1 px-2 pb-1">
        <game-asset
          v-for="part in visibleProducts"
          :key="part"
          height="18"
          :subject="part"
          type="item"
          width="18"
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
      target, so a collapsed group could not be dropped into. Collapsed, it holds no rows and
      shows a strip instead — a real element with real height for Sortable to aim at.
    -->
    <draggable
      class="group-body"
      :class="{ collapsed }"
      :group="{ name: 'sidebar-factories' }"
      item-key="id"
      :model-value="collapsed ? [] : section.factories"
      @change="onChange"
    >
      <template #header>
        <div v-if="showDropStrip" class="drop-strip">
          <span v-if="collapsed">Drop here to add to {{ group?.name ?? 'Ungrouped' }}</span>
          <span v-else>Drop a factory here</span>
        </div>
      </template>
      <template #item="{ element }">
        <planner-sidebar-factory-row :factory="element" :statuses="statuses.get(element.id)" />
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
  import { groupColorVars } from '@/utils/colors'
  import { getPartDisplayName } from '@/utils/helpers'
  import FactoryGroupColorMenu from '@/components/planner/groups/FactoryGroupColorMenu.vue'
  import PlannerSidebarFactoryRow from '@/components/planner/groups/PlannerSidebarFactoryRow.vue'

  const props = defineProps<{
    section: FactoryGroupSection
    statuses: Map<number, FactoryStatus[]>
    ungroupedCollapsed: boolean
  }>()

  const emit = defineEmits<{
    (event: 'delete', group: NonNullable<FactoryGroupSection['group']>): void
    (event: 'toggle-ungrouped'): void
  }>()

  const { renameGroup, setGroupColor, setGroupCollapsed, moveFactoryToGroup } = useFactoryGroups()

  const group = computed(() => props.section.group)
  // Ungrouped has nowhere to persist a collapse flag — it is not a stored group — so its state
  // is held by the list and shared between the two mounted sidebars.
  const collapsed = computed(() => group.value?.collapsed ?? props.ungroupedCollapsed)

  const colorVars = computed(() =>
    group.value ? groupColorVars(group.value.color) : {}
  )

  // The strip is the group's only drop target when there are no rows to aim at — collapsed, or
  // simply empty. Without it an expanded empty group is zero pixels tall and cannot be dragged
  // into at all, which is exactly the state a freshly created group is in.
  const showDropStrip = computed(() => collapsed.value || props.section.factories.length === 0)

  const draftName = ref(group.value?.name ?? '')
  watch(() => group.value?.name, name => {
    if (name !== undefined) draftName.value = name
  })

  const commitName = () => {
    if (!group.value || draftName.value === group.value.name) return
    renameGroup(group.value.id, draftName.value)
  }

  const toggle = () => {
    if (group.value) setGroupCollapsed(group.value.id, !group.value.collapsed)
    else emit('toggle-ungrouped')
  }

  const requestDelete = () => {
    if (group.value) emit('delete', group.value)
  }

  const PRODUCT_LIMIT = 8

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

  const visibleProducts = computed(() => products.value.slice(0, PRODUCT_LIMIT))
  const hiddenProducts = computed(() => products.value.slice(PRODUCT_LIMIT))

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
.sidebar-group {
  border-radius: 4px;
  overflow: hidden;
  border-left: 3px solid var(--sf-group, transparent);
}

.group-header {
  background-color: var(--sf-group-muted, rgba(255, 255, 255, 0.04));
  font-size: 0.9rem;

  .delete-group {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  &:hover .delete-group {
    opacity: 1;
  }
}

.group-drag-handle {
  cursor: grab;
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

.group-body.collapsed {
  min-height: 0;
}

// The "overlay over the group you could be entering" — only rendered while collapsed, and the
// element Sortable actually measures.
.drop-strip {
  margin: 4px 6px 6px;
  padding: 6px;
  border: 1px dashed var(--sf-group, #777);
  border-radius: 4px;
  text-align: center;
  font-size: 0.72rem;
  color: #bdbdbd;
  transition: background-color 0.15s ease;
}

.group-body.collapsed:hover .drop-strip {
  background-color: var(--sf-group-muted, rgba(255, 255, 255, 0.08));
}

.overflow-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.14);
  font-size: 0.7rem;
  cursor: default;
}
</style>
