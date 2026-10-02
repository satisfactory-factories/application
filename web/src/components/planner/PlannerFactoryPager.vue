<!-- The way on from the page the planner is showing. The pane holds one factory at a time, so this
     stands in for what scrolling used to do: the next factory in sidebar order at the bottom, the
     previous one at the top. It names where it goes, and the group that factory belongs to, so a
     click never lands somewhere unexpected. -->
<template>
  <v-card
    class="factory-pager d-flex align-center ga-3 px-4 py-3"
    :class="[direction, { grouped: !!targetGroup }]"
    :data-testid="`factory-pager-${direction}`"
    :style="targetGroup ? groupColorVars(targetGroup.color) : undefined"
    variant="tonal"
    @click="emit('go', target)"
  >
    <i class="fas pager-arrow" :class="direction === 'next' ? 'fa-arrow-down' : 'fa-arrow-up'" />
    <div class="d-flex flex-column flex-grow-1 min-width-0">
      <span class="text-caption text-medium-emphasis pager-caption">{{ caption }}</span>
      <div class="d-flex align-center ga-2 text-h6 pager-title">
        <template v-if="target === OVERVIEW">
          <i class="fas fa-chart-line" />
          <span>Overview</span>
        </template>
        <template v-else>
          <factory-icon-display :icon="target.icon" size="24" />
          <!-- Between the icon and the name, where the factory's own header carries it. -->
          <v-chip
            v-if="targetGroup"
            class="sf-chip small no-margin group-chip"
            data-testid="factory-pager-group"
            variant="tonal"
          >
            <i class="fas fa-folder" />
            <span class="ml-2">{{ targetGroup.name }}</span>
          </v-chip>
          <span class="text-truncate">{{ target.name || 'Unnamed factory' }}</span>
        </template>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { OVERVIEW } from '@/utils/factory-management/planner-view'
  import { groupColorVars } from '@/utils/colors'

  const props = defineProps<{
    direction: 'previous' | 'next'
    target: Factory | typeof OVERVIEW
    // The factory on screen, or null on the overview. Only read to say whether the target is in
    // the same group or starts a new one.
    from: Factory | null
  }>()

  const emit = defineEmits<{ (event: 'go', target: Factory | typeof OVERVIEW): void }>()

  const targetGroup = computed(() => props.target === OVERVIEW ? null : props.target.group ?? null)

  const caption = computed(() => {
    if (props.target === OVERVIEW) return 'Back to the plan overview'
    if (!props.from) return 'First factory'

    const label = props.direction === 'next' ? 'Next' : 'Previous'
    const group = targetGroup.value
    if (!group) return `${label} factory`
    // Crossing into a different group is worth saying out loud: the sidebar shows it as a new
    // heading, and the pane has nothing else to mark the boundary.
    return group.id === props.from.group?.id ? `${label} in ${group.name}` : `${label} group: ${group.name}`
  })
</script>

<style lang="scss" scoped>
.factory-pager {
  cursor: pointer;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  transition: border-color 0.15s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.5);
  }

  &.grouped {
    border-left: 6px solid var(--sf-group, #6c6c6c);
  }

  &.previous {
    margin-bottom: 12px;
  }

  &.next {
    margin-top: 12px;
  }
}

.pager-arrow {
  font-size: 1.25rem;
}

.min-width-0 {
  min-width: 0;
}

.pager-title {
  font-weight: 500;
  min-width: 0;
}

// The group's colour, as on the group chip in a factory's header.
.group-chip {
  flex: none;
  border-color: var(--sf-group) !important;
  background-color: var(--sf-group-muted) !important;
}
</style>
