<template>
  <v-menu location="bottom end">
    <template #activator="{ props: activatorProps }">
      <!-- Sits on the title line beside the factory icon rather than in the status bar below: where
           a factory lives is not a thing that has gone wrong with it. -->
      <v-chip
        class="sf-chip sf-chip-clickable small group-chip"
        :class="{ ungrouped: !factory.group }"
        :data-hover-tooltip="factory.group ? `In group: ${factory.group.name} — click to change` : 'Not in a group — click to assign one'"
        :style="factory.group ? groupChipStyle : undefined"
        v-bind="activatorProps"
      >
        <i class="fas fa-folder" />
        <span class="ml-2">{{ factory.group?.name ?? 'Ungrouped' }}</span>
      </v-chip>
    </template>

    <v-card min-width="240">
      <v-list density="compact">
        <v-list-item
          v-for="group in groups"
          :key="group.id"
          :active="group.id === factory.group?.id"
          @click="moveFactoryToGroup(factory.id, group.id)"
        >
          <template #prepend>
            <span class="dot mr-3" :style="{ backgroundColor: group.color }" />
          </template>
          <v-list-item-title>{{ group.name }}</v-list-item-title>
          <template v-if="group.id === factory.group?.id" #append>
            <i class="fas fa-check" />
          </template>
        </v-list-item>

        <v-divider v-if="groups.length" />

        <v-list-item v-if="factory.group" @click="moveFactoryToGroup(factory.id, null)">
          <template #prepend>
            <i class="fas fa-times mr-3" />
          </template>
          <v-list-item-title>Remove from group</v-list-item-title>
        </v-list-item>

        <v-list-item @click="createOpen = true">
          <template #prepend>
            <i class="fas fa-plus mr-3" />
          </template>
          <v-list-item-title>New group…</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>

  <factory-group-create-dialog v-model="createOpen" @created="moveFactoryToGroup(factory.id, $event)" />
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { groupColorVars } from '@/utils/colors'
  import FactoryGroupCreateDialog from '@/components/planner/groups/FactoryGroupCreateDialog.vue'

  const props = defineProps<{ factory: Factory }>()

  const { groups, moveFactoryToGroup } = useFactoryGroups()

  const createOpen = ref(false)

  // Wearing the group's own colour, so the chip says which group without reading it. Only the
  // custom properties — the colours themselves are applied in CSS, where they can carry the
  // `!important` needed to beat .sf-chip's border.
  const groupChipStyle = computed(() =>
    groupColorVars(props.factory.group?.color ?? '#ffffff')
  )
</script>

<style scoped>
/* Own margin rather than a utility class: .sf-chip's margins are !important, and only a scoped
   rule outranks them. */
.group-chip {
  cursor: pointer;
  margin: 0 0 0 12px !important;
}

/* .sf-chip's border is `!important`, so the group colour needs to be too or the chip stays grey. */
.group-chip:not(.ungrouped) {
  border-color: var(--sf-group) !important;
  background-color: var(--sf-group-muted) !important;
}

.group-chip.ungrouped {
  font-style: italic;
  opacity: 0.75;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}
</style>
