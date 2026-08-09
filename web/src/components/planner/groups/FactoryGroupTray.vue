<template>
  <v-menu location="bottom end">
    <template #activator="{ props: activatorProps }">
      <v-btn
        class="mr-2 rounded"
        :color="factory.group ? undefined : 'primary'"
        size="small"
        :style="factory.group ? groupButtonStyle : undefined"
        title="Set this factory's group"
        variant="outlined"
        v-bind="activatorProps"
      >
        <i class="fas fa-folder" />
        <span class="ml-2">{{ factory.group?.name ?? 'Group' }}</span>
      </v-btn>
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

  // Wearing the group's own colour, so the button says which group without reading it.
  const groupButtonStyle = computed(() => ({
    ...groupColorVars(props.factory.group?.color ?? '#ffffff'),
    borderColor: 'var(--sf-group)',
    color: 'var(--sf-group)',
  }))
</script>

<style scoped>
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}
</style>
