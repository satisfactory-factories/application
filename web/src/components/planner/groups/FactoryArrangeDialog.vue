<!-- Reorder the plan: groups against each other, factories within their group, and factories from
     one group into another.

     The sidebar can already do all three by drag, which is quick with a mouse, fiddly in a narrow
     tray and impossible on a touchscreen — where the same gesture scrolls the sidebar, so drag is
     switched off entirely (see useFactoryDrag). This is the same operation done with buttons, at a
     size that fits the whole plan on screen at once. -->
<template>
  <v-dialog v-model="isOpen" max-width="640" scrollable>
    <v-card>
      <v-card-title class="text-h6 py-4">Arrange plan</v-card-title>
      <v-divider />

      <div class="px-4 py-2 text-caption text-medium-emphasis">{{ hint }}</div>

      <v-divider />

      <v-card-text class="pa-0 arrange-list">
        <!-- Pinned above the groups and not itself draggable: Ungrouped is synthesised, not
             stored, so there is no group record to reorder. -->
        <factory-arrange-section v-if="ungroupedSection" :section="ungroupedSection" />

        <draggable
          :disabled="!dragEnabled"
          :group="{ name: 'arrange-groups' }"
          handle=".group-drag-handle"
          :item-key="sectionKey"
          :model-value="groupSections"
          @change="onGroupOrderChange"
        >
          <template #item="{ element, index }">
            <factory-arrange-section
              :position="index"
              :section="element"
              :total="groupSections.length"
            />
          </template>
        </draggable>
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <v-btn
          class="ml-2"
          prepend-icon="fas fa-folder-plus"
          size="small"
          variant="outlined"
          @click="createOpen = true"
        >New group</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <factory-group-create-dialog v-model="createOpen" />
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import draggable from 'vuedraggable'
  import { FactoryGroup } from '@/interfaces/planner/FactoryInterface'
  import { FactoryGroupSection } from '@/utils/factory-management/factory-groups'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { useFactoryDrag } from '@/composables/useFactoryDrag'
  import FactoryArrangeSection from '@/components/planner/groups/FactoryArrangeSection.vue'
  import FactoryGroupCreateDialog from '@/components/planner/groups/FactoryGroupCreateDialog.vue'

  const isOpen = defineModel<boolean>({ required: true })

  const { sections, setGroupOrder } = useFactoryGroups()
  const { dragEnabled } = useFactoryDrag()

  const createOpen = ref(false)

  const ungroupedSection = computed(() => sections.value.find(section => !section.group))
  const groupSections = computed(() => sections.value.filter(section => section.group))

  const hint = computed(() => dragEnabled.value
    ? 'Drag a group by its handle, or use the arrows. The folder button files a factory under another group.'
    : 'Use the arrows to move things. The folder button files a factory under another group.')

  // A section is keyed by the group it wraps; two sections never share one, and an `id` read off
  // the section itself is undefined for every one of them.
  const sectionKey = (section: FactoryGroupSection) => section.group?.id ?? 'ungrouped'

  const onGroupOrderChange = (event: { moved?: { newIndex: number, oldIndex: number } }) => {
    if (!event.moved) return
    const ordered = groupSections.value.map(section => section.group as FactoryGroup)
    const [group] = ordered.splice(event.moved.oldIndex, 1)
    ordered.splice(event.moved.newIndex, 0, group)
    setGroupOrder(ordered)
  }
</script>

<style lang="scss" scoped>
.arrange-list {
  max-height: 60vh;
}
</style>
