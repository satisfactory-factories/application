<!-- One section of the Arrange dialog: a group's header, and the factories filed under it.

     Every control here is a button. Drag is offered on top of them for groups when there is a
     precise pointer to drag with, but nothing in this dialog depends on it — that is the point of
     the dialog, since drag is off entirely on a touchscreen (see useFactoryDrag). -->
<template>
  <div class="arrange-section" :style="colorVars">
    <div class="section-head d-flex align-center ga-2 px-3 py-2">
      <!-- The hint sits on a wrapper rather than the icon: Font Awesome replaces the <i> with an
           <svg>, which ignores the `title` attribute. The handle class stays on the icon, which is
           what Sortable grabs. -->
      <span
        v-if="group && dragEnabled"
        class="d-inline-flex align-center"
        title="Drag to reorder group"
      >
        <i class="fas fa-grip-lines group-drag-handle text-grey-darken-1" />
      </span>
      <span class="dot" :style="{ backgroundColor: group?.color ?? '#9e9e9e' }" />
      <span class="text-truncate" :class="group ? 'group-name' : 'ungrouped-label'">
        {{ group?.name ?? 'Ungrouped' }}
      </span>
      <span class="text-caption text-medium-emphasis">({{ section.factories.length }})</span>

      <v-spacer />

      <!-- Ungrouped is synthesised rather than stored, so there is no group record to reorder. -->
      <template v-if="group">
        <v-btn
          class="group-up"
          density="comfortable"
          :disabled="position === 0"
          icon="fas fa-chevron-up"
          size="small"
          title="Move group up"
          variant="text"
          @click="reorderGroup(group.id, 'up')"
        />
        <v-btn
          class="group-down"
          density="comfortable"
          :disabled="position === total - 1"
          icon="fas fa-chevron-down"
          size="small"
          title="Move group down"
          variant="text"
          @click="reorderGroup(group.id, 'down')"
        />
      </template>
    </div>

    <div v-if="!section.factories.length" class="px-3 py-2 text-caption text-medium-emphasis">
      Nothing filed here yet.
    </div>

    <div
      v-for="(factory, index) in section.factories"
      :key="factory.id"
      class="factory-row d-flex align-center ga-2 px-3 py-1"
    >
      <factory-icon-display :icon="factory.icon" size="20" />
      <span class="text-truncate">{{ factory.name }}</span>

      <v-spacer />

      <!-- Within the group only. The plan's factories array is sorted group-contiguous, so a
           position that crossed a group boundary would be a move to another group wearing the
           wrong control — that is what the folder menu beside these is for. -->
      <v-btn
        class="factory-up"
        density="comfortable"
        :disabled="index === 0"
        icon="fas fa-chevron-up"
        size="small"
        title="Move factory up"
        variant="text"
        @click="moveWithin(factory.id, index - 1)"
      />
      <v-btn
        class="factory-down"
        density="comfortable"
        :disabled="index === section.factories.length - 1"
        icon="fas fa-chevron-down"
        size="small"
        title="Move factory down"
        variant="text"
        @click="moveWithin(factory.id, index + 1)"
      />
      <v-menu>
        <template #activator="{ props: activatorProps }">
          <v-btn
            class="factory-move-to"
            density="comfortable"
            icon="fas fa-folder-open"
            size="small"
            title="File under another group"
            v-bind="activatorProps"
            variant="text"
          />
        </template>
        <v-list density="compact">
          <v-list-item
            v-for="target in targets"
            :key="target.value"
            :disabled="target.value === currentTarget"
            @click="moveTo(factory.id, target.value)"
          >
            <template #prepend>
              <span class="dot mr-3" :style="{ backgroundColor: target.color }" />
            </template>
            <v-list-item-title>{{ target.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { FactoryGroupSection, UNGROUPED_ID } from '@/utils/factory-management/factory-groups'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { useFactoryDrag } from '@/composables/useFactoryDrag'
  import { groupColorVars } from '@/utils/colors'

  // Where this group sits among the groups, and how many there are — what the arrows disable on.
  // Ungrouped passes neither: it is pinned to the top and draws no arrows at all, so the defaults
  // are only there to keep the two numbers non-optional for the template's arithmetic.
  const props = withDefaults(defineProps<{
    section: FactoryGroupSection
    position?: number
    total?: number
  }>(), {
    position: 0,
    total: 0,
  })

  const { groups, moveFactoryToGroup, reorderGroup } = useFactoryGroups()
  const { dragEnabled } = useFactoryDrag()

  const group = computed(() => props.section.group)
  const currentTarget = computed(() => group.value?.id ?? UNGROUPED_ID)

  const colorVars = computed(() => group.value ? groupColorVars(group.value.color) : {})

  const targets = computed(() => [
    ...groups.value.map(entry => ({ title: entry.name, value: entry.id, color: entry.color })),
    { title: 'Ungrouped', value: UNGROUPED_ID, color: '#9e9e9e' },
  ])

  const moveWithin = (factoryId: number, index: number) =>
    moveFactoryToGroup(factoryId, group.value?.id ?? null, index)

  const moveTo = (factoryId: number, target: string) =>
    moveFactoryToGroup(factoryId, target === UNGROUPED_ID ? null : target)
</script>

<style lang="scss" scoped>
.section-head {
  font-weight: 500;
  background-color: var(--sf-group-muted, rgba(255, 255, 255, 0.06));
  border-left: 2px solid var(--sf-group, #9e9e9e);
}

.group-drag-handle {
  cursor: grab;
}

.ungrouped-label {
  color: #bdbdbd;
  font-style: italic;
}

.factory-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  // The colour bar runs the whole height of the section, so a group reads as one block rather than
  // as a heading with a loose list under it.
  border-left: 2px solid var(--sf-group, #9e9e9e);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  flex: 0 0 auto;
}
</style>
