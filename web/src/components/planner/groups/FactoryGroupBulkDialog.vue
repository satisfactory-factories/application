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
        <div
          v-for="{ section, summary, rows } in decoratedSections"
          :key="section.group?.id ?? 'ungrouped'"
        >
          <!-- Grouped by where each factory is now, because the useful selection is almost always
               "everything currently in X" or "everything not in a group yet". -->
          <div class="section-head px-4 py-2" :style="sectionVars(section)">
            <div class="d-flex align-center ga-2">
              <span class="dot" :style="{ backgroundColor: section.group?.color ?? '#9e9e9e' }" />
              <span :class="{ 'ungrouped-label': !section.group }">
                {{ section.group?.name ?? 'Ungrouped' }}
              </span>
              <span class="text-medium-emphasis text-caption">({{ section.factories.length }})</span>
              <v-spacer />
              <v-btn size="x-small" variant="text" @click="selectSection(section)">
                {{ allSelectedIn(section) ? 'Deselect' : 'Select' }} these
              </v-btn>
              <!-- Arrows rather than a drag: this list re-sections itself as factories move, so a
                   drag would be aiming at rows that shift under it. Ungrouped has no arrows — it
                   is pinned to the top and is not a group that can be ordered. -->
              <template v-if="section.group">
                <v-btn
                  density="compact"
                  :disabled="groupIndex(section) === 0"
                  icon="fas fa-chevron-up"
                  size="x-small"
                  title="Move group up"
                  variant="text"
                  @click="reorderGroup(section.group.id, 'up')"
                />
                <v-btn
                  density="compact"
                  :disabled="groupIndex(section) === groups.length - 1"
                  icon="fas fa-chevron-down"
                  size="x-small"
                  title="Move group down"
                  variant="text"
                  @click="reorderGroup(section.group.id, 'down')"
                />
              </template>
            </div>

            <!-- Everything the group makes, rolled up across its factories — the same summary the
                 sidebar's group header carries. -->
            <div v-if="summary.shown.length" class="d-flex align-center ga-1 mt-1">
              <game-asset
                v-for="part in summary.shown"
                :key="part"
                height="24"
                :subject="part"
                type="item"
                width="24"
              />
              <v-tooltip v-if="summary.hidden.length" location="bottom">
                <template #activator="{ props: activatorProps }">
                  <span class="overflow-count" v-bind="activatorProps">+{{ summary.hidden.length }}</span>
                </template>
                <span>{{ summary.hidden.map(getPartDisplayName).join(', ') }}</span>
              </v-tooltip>
            </div>
          </div>

          <v-list-item
            v-for="{ factory, shown, hidden } in rows"
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
            <div class="d-flex align-center ga-2 w-100">
              <factory-icon-display :icon="factory.icon" size="20" />
              <span class="text-truncate">{{ factory.name }}</span>
              <v-spacer />
              <!-- What the factory makes. Right-aligned rather than trailing the name so the
                   strips line up in a column, and so a long name truncates instead of shoving
                   them off the row. -->
              <div v-if="shown.length" class="product-strip d-flex align-center ga-1">
                <game-asset
                  v-for="part in shown"
                  :key="part"
                  height="20"
                  :subject="part"
                  type="item"
                  width="20"
                />
                <v-tooltip v-if="hidden.length" location="bottom">
                  <template #activator="{ props: activatorProps }">
                    <span class="overflow-count" v-bind="activatorProps">+{{ hidden.length }}</span>
                  </template>
                  <span>{{ hidden.map(getPartDisplayName).join(', ') }}</span>
                </v-tooltip>
              </div>
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
  import { getPartDisplayName } from '@/utils/helpers'
  import eventBus from '@/utils/eventBus'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import FactoryGroupCreateDialog from '@/components/planner/groups/FactoryGroupCreateDialog.vue'

  const isOpen = defineModel<boolean>({ required: true })

  const { groups, moveFactoriesToGroup, reorderGroup, sections } = useFactoryGroups()

  const groupIndex = (section: FactoryGroupSection) =>
    groups.value.findIndex(group => group.id === section.group?.id)

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

  // A factory is recognised by what it makes far faster than by a name someone picked months ago,
  // so each row carries its products. Byproducts are left out, as in the sidebar's group row: they
  // are not what the factory is for, and they double the strip on the refinery lines.
  //
  // A flat cap rather than the sidebar's measured fit — this dialog is a fixed 720px, so there is
  // no width to react to and nothing to gain from an observer per row.
  const MAX_PRODUCT_ICONS = 6
  // The group's roll-up gets the whole width of the dialog to itself, so it holds far more.
  const MAX_SUMMARY_ICONS = 16

  // Deduped, in the order the factories declare them, so the icons stay put as the plan changes
  // rather than reshuffling on every recalc.
  const productIds = (factories: Factory[]) =>
    [...new Set(factories.flatMap(factory => factory.products.map(product => product.id)))]

  // The +N tile takes a slot of its own, so it only earns one when it hides more than the icon it
  // displaces.
  const split = (parts: string[], cap: number) => {
    const shownCount = parts.length <= cap ? parts.length : cap - 1
    return { shown: parts.slice(0, shownCount), hidden: parts.slice(shownCount) }
  }

  const decoratedSections = computed(() => sections.value.map(section => ({
    section,
    summary: split(productIds(section.factories), MAX_SUMMARY_ICONS),
    rows: section.factories.map(factory => ({
      factory,
      ...split(productIds([factory]), MAX_PRODUCT_ICONS),
    })),
  })))

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

// Never squeezed by a long factory name — the name truncates instead.
.product-strip {
  flex: 0 0 auto;
}

.overflow-count {
  font-size: 0.75rem;
  color: #bdbdbd;
  white-space: nowrap;
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
