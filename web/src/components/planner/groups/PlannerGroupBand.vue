<!-- The heading above a group's cards in the planner. Deliberately lighter than the sidebar's
     header: the sidebar is where you manage groups, this is a signpost while scrolling. -->
<template>
  <div :id="bandId" class="group-band" :class="{ ungrouped: !group }" :style="colorVars">
    <div class="d-flex align-center ga-2 px-3 py-2">
      <v-btn
        density="compact"
        :icon="collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-down'"
        size="small"
        :title="collapsed ? 'Expand group' : 'Collapse group'"
        variant="text"
        @click="$emit('toggle')"
      />
      <span class="band-title text-h6">{{ group?.name ?? 'Ungrouped' }}</span>
      <v-chip class="sf-chip small no-margin factory" variant="tonal">
        <i class="fas fa-industry" />
        <span class="ml-2">{{ count }}</span>
      </v-chip>
      <v-spacer />
      <span v-if="collapsed" class="text-body-2 text-medium-emphasis">
        {{ count }} {{ count === 1 ? 'factory' : 'factories' }} hidden
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { FactoryGroup } from '@/interfaces/planner/FactoryInterface'
  import { groupColorVars } from '@/utils/colors'

  const props = defineProps<{
    group: FactoryGroup | null
    count: number
    collapsed: boolean
  }>()

  defineEmits<{ (event: 'toggle'): void }>()

  // Element id so the scroll-spy can see the band and the sidebar can jump to it.
  const bandId = computed(() => `group-${props.group?.id ?? 'ungrouped'}`)

  const colorVars = computed(() => (props.group ? groupColorVars(props.group.color) : {}))
</script>

<style lang="scss" scoped>
.group-band {
  border-radius: 4px;
  margin-bottom: 8px;
  background-color: var(--sf-group-muted, rgba(255, 255, 255, 0.05));
  border-left: 5px solid var(--sf-group, #6c6c6c);
}

.band-title {
  font-weight: 500;
}

.ungrouped .band-title {
  color: #bdbdbd;
  font-style: italic;
}
</style>
