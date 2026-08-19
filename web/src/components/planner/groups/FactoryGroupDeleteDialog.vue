<template>
  <v-dialog v-model="isOpen" max-width="520">
    <v-card v-if="group">
      <v-card-title class="text-h6 py-4">Delete "{{ group.name }}"?</v-card-title>
      <v-divider />
      <v-card-text>
        <!-- An empty group is still confirmed, so that the red button next to a group's own
             controls cannot delete one on a single stray click. There is just nothing to ask. -->
        <p v-if="!count" class="text-body-2 mb-0">
          This group is empty. Deleting it changes nothing else in the plan.
        </p>
        <p v-else class="text-body-2 mb-4">
          {{ count }} {{ count === 1 ? 'factory is' : 'factories are' }} in this group.
          Deleting the group does not delete them — choose where they should go.
        </p>
        <v-radio-group v-if="count" v-model="destination" hide-details>
          <v-radio label="Ungrouped" :value="null" />
          <v-radio
            v-for="other in otherGroups"
            :key="other.id"
            :value="other.id"
          >
            <template #label>
              <span class="d-flex align-center">
                <span class="dot mr-2" :style="{ backgroundColor: other.color }" />
                {{ other.name }}
              </span>
            </template>
          </v-radio>
        </v-radio-group>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Cancel</v-btn>
        <v-btn color="red" variant="flat" @click="confirm">Delete group</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { FactoryGroup } from '@/interfaces/planner/FactoryInterface'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'

  const props = defineProps<{ group: FactoryGroup | null }>()

  const isOpen = defineModel<boolean>({ required: true })

  const { deleteGroup, groups, countIn } = useFactoryGroups()

  const destination = ref<string | null>(null)

  watch(isOpen, open => {
    if (open) destination.value = null
  })

  const count = computed(() => (props.group ? countIn(props.group.id) : 0))
  const otherGroups = computed(() => groups.value.filter(group => group.id !== props.group?.id))

  const confirm = () => {
    if (props.group) deleteGroup(props.group.id, destination.value)
    isOpen.value = false
  }
</script>

<style scoped>
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}
</style>
