<!-- Assign many factories to a group at once.

     The tray on each card is fine for one factory and miserable for forty: organising an existing
     plan for the first time meant opening every card in turn. This is the same operation done to a
     selection. -->
<template>
  <v-dialog v-model="isOpen" max-width="720" scrollable>
    <v-card>
      <v-card-title class="text-h6 py-4">Multi-group edit</v-card-title>
      <v-divider />

      <div class="px-4 py-3 d-flex align-center flex-wrap ga-2">
        <v-select
          v-model="target"
          density="compact"
          hide-details
          :items="targets"
          label="Move selected to"
          style="max-width: 260px;"
          variant="outlined"
        >
          <template #item="{ props: itemProps }">
            <v-list-item v-bind="itemProps">
              <template #prepend>
                <span class="dot mr-3" :style="{ backgroundColor: colorOf(itemProps.value) }" />
              </template>
            </v-list-item>
          </template>
        </v-select>
        <v-btn
          prepend-icon="fas fa-folder-plus"
          size="small"
          variant="outlined"
          @click="createOpen = true"
        >New group</v-btn>

        <v-spacer />

        <v-btn size="small" variant="text" @click="selectAll">Select all</v-btn>
        <v-btn :disabled="!selected.size" size="small" variant="text" @click="selected.clear()">
          Clear
        </v-btn>
      </div>

      <v-divider />

      <v-card-text class="pa-0 factory-list">
        <div v-for="section in sections" :key="section.group?.id ?? 'ungrouped'">
          <!-- Grouped by where each factory is now, because the useful selection is almost always
               "everything currently in X" or "everything not in a group yet". -->
          <div class="section-head d-flex align-center ga-2 px-4 py-2" :style="sectionVars(section)">
            <span class="dot" :style="{ backgroundColor: section.group?.color ?? '#9e9e9e' }" />
            <span :class="{ 'ungrouped-label': !section.group }">
              {{ section.group?.name ?? 'Ungrouped' }}
            </span>
            <span class="text-medium-emphasis text-caption">({{ section.factories.length }})</span>
            <v-spacer />
            <v-btn size="x-small" variant="text" @click="selectSection(section)">
              {{ allSelectedIn(section) ? 'Deselect' : 'Select' }} these
            </v-btn>
          </div>

          <v-list-item
            v-for="factory in section.factories"
            :key="factory.id"
            class="factory-row"
            density="compact"
            @click="toggle(factory.id)"
          >
            <!-- Box and tick are both drawn in CSS, with no icon anywhere in it.
                 <v-checkbox-btn> is out because Vuetify's FA aliases use `far fa-square` for the
                 unchecked state and this app ships no Font Awesome regular family, so the empty
                 box renders as nothing at all. A Font Awesome tick is out for the opposite
                 reason: FA replaces the <i> with an <svg> Vue no longer owns, so v-if removed
                 nothing and unticking left the tick behind. A class on a pseudo-element cannot
                 fall out of step with the state that drives it. -->
            <template #prepend>
              <span class="tick mr-3" :class="{ on: selected.has(factory.id) }" /></template>
            <div class="d-flex align-center ga-2">
              <factory-icon-display :icon="factory.icon" size="20" />
              <span>{{ factory.name }}</span>
            </div>
          </v-list-item>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <span class="ml-2 text-body-2 text-medium-emphasis">
          {{ selected.size }} selected
        </span>
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Cancel</v-btn>
        <v-btn color="primary" :disabled="!selected.size" variant="flat" @click="apply">
          Move {{ selected.size || '' }} to {{ targetName }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <factory-group-create-dialog v-model="createOpen" @created="target = $event" />
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { FactoryGroupSection, UNGROUPED_ID } from '@/utils/factory-management/factory-groups'
  import { groupColorVars } from '@/utils/colors'
  import eventBus from '@/utils/eventBus'
  import FactoryGroupCreateDialog from '@/components/planner/groups/FactoryGroupCreateDialog.vue'

  const isOpen = defineModel<boolean>({ required: true })

  const { groups, moveFactoriesToGroup, sections } = useFactoryGroups()

  const selected = reactive(new Set<number>())
  const target = ref<string>(UNGROUPED_ID)
  const createOpen = ref(false)

  // A fresh selection every time it opens: a stale one from the last visit is a way to move
  // factories you had forgotten were ticked.
  watch(isOpen, open => {
    if (!open) return
    selected.clear()
    target.value = groups.value[0]?.id ?? UNGROUPED_ID
  })

  const targets = computed(() => [
    ...groups.value.map(group => ({ title: group.name, value: group.id, color: group.color })),
    { title: 'Ungrouped (remove from group)', value: UNGROUPED_ID, color: '#9e9e9e' },
  ])

  const colorOf = (value: unknown) =>
    targets.value.find(entry => entry.value === value)?.color ?? '#9e9e9e'

  const targetName = computed(() =>
    targets.value.find(entry => entry.value === target.value)?.title ?? 'Ungrouped'
  )

  // The select needs "Ungrouped (remove from group)" to be unambiguous; a toast does not.
  const shortTargetName = computed(() =>
    groups.value.find(group => group.id === target.value)?.name ?? 'Ungrouped'
  )

  const sectionVars = (section: FactoryGroupSection) =>
    section.group ? groupColorVars(section.group.color) : {}

  const toggle = (id: number) => {
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
  }

  const allSelectedIn = (section: FactoryGroupSection) =>
    section.factories.length > 0 && section.factories.every(factory => selected.has(factory.id))

  const selectSection = (section: FactoryGroupSection) => {
    const deselect = allSelectedIn(section)
    for (const factory of section.factories) {
      if (deselect) selected.delete(factory.id)
      else selected.add(factory.id)
    }
  }

  const selectAll = () => {
    for (const section of sections.value) {
      for (const factory of section.factories) selected.add(factory.id)
    }
  }

  // Stays open so several groups can be filled in one visit — the list re-sections in place, and
  // the toast is what says the move landed.
  const apply = () => {
    // Snapshot the ids first: the mutation reorders the factories array in place.
    const moved = moveFactoriesToGroup([...selected], target.value === UNGROUPED_ID ? null : target.value)
    selected.clear()
    eventBus.emit('toast', {
      message: `Groups Assigned — ${moved.length} moved to ${shortTargetName.value}`,
      type: 'info',
    })
  }
</script>

<style lang="scss" scoped>
.factory-list {
  max-height: 60vh;
}

.section-head {
  position: sticky;
  top: 0;
  z-index: 1;
  font-weight: 500;
  background-color: var(--sf-group-muted, rgba(255, 255, 255, 0.06));
  border-left: 2px solid var(--sf-group, #9e9e9e);
}

.ungrouped-label {
  color: #bdbdbd;
  font-style: italic;
}

.factory-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tick {
  position: relative;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-radius: 3px;
  display: inline-block;
  flex: 0 0 auto;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.tick.on {
  background-color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}

// Two borders of a rotated box: the short arm and the long arm of a tick.
.tick.on::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 0;
  width: 5px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  flex: 0 0 auto;
}
</style>
