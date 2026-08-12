<template>
  <v-dialog v-model="isOpen" max-width="460">
    <v-card>
      <v-card-title class="text-h6 py-4">New group</v-card-title>
      <v-divider />
      <v-card-text>
        <!-- Colour first, beside the name: picking one is the fast path, and having it inline
             means a group is never created uncoloured and then fixed up afterwards. -->
        <div class="d-flex align-center ga-3">
          <div class="colour-column">
            <div class="swatch-grid">
              <button
                v-for="entry in groupPalette"
                :key="entry.value"
                class="swatch"
                :class="{ selected: entry.value === color }"
                :style="{ backgroundColor: entry.value }"
                :title="entry.name"
                type="button"
                @click="color = entry.value"
              />
              <button
                class="swatch custom-trigger"
                :class="{ selected: custom }"
                title="Custom colour"
                type="button"
                @click="custom = !custom"
              >
                <i class="fas fa-plus" />
              </button>
            </div>
          </div>
        </div>

        <v-color-picker
          v-if="custom"
          v-model="color"
          class="mt-3"
          hide-inputs
          mode="hex"
          :modes="['hex']"
        />

        <v-text-field
          ref="nameField"
          v-model="name"
          autofocus
          class="mt-4"
          hide-details
          label="Group name"
          variant="outlined"
          @keyup.enter="submit"
        />
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <div class="preview ml-2" :style="previewStyle">
          <span class="preview-spine" />
          <span class="ml-2">{{ name || 'New group' }}</span>
        </div>
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="submit">Create</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { groupColorVars, groupPalette } from '@/utils/colors'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { defaultGroupColor } from '@/utils/factory-management/factory-groups'

  const isOpen = defineModel<boolean>({ required: true })

  const emit = defineEmits<{ (event: 'created', groupId: string): void }>()

  const { createGroup, groups } = useFactoryGroups()

  const name = ref('')
  const color = ref(groupPalette[0].value)
  const custom = ref(false)

  watch(isOpen, open => {
    if (!open) return
    name.value = ''
    custom.value = false
    color.value = defaultGroupColor(groups.value)
  })

  const previewStyle = computed(() => groupColorVars(color.value))

  const submit = () => {
    const group = createGroup(name.value, color.value)
    if (group) emit('created', group.id)
    isOpen.value = false
  }
</script>

<style lang="scss" scoped>
.swatch-grid {
  display: grid;
  grid-template-columns: repeat(6, 28px);
  gap: 8px;
}

.swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: transform 0.15s ease;

  &:hover {
    transform: scale(1.12);
  }

  &.selected {
    border: 2px solid #fff;
  }
}

.custom-trigger {
  background-color: transparent;
  border-style: dashed;
  color: #ccc;
  font-size: 12px;
}

.preview {
  display: flex;
  align-items: center;
  padding: 4px 10px 4px 0;
  border-radius: 4px;
  background-color: var(--sf-group-muted);
  font-size: 0.85rem;
  overflow: hidden;
}

.preview-spine {
  width: 4px;
  align-self: stretch;
  background-color: var(--sf-group);
}
</style>
