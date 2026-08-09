<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: activatorProps }">
      <button
        class="group-swatch"
        :style="{ backgroundColor: modelValue }"
        title="Change group colour"
        type="button"
        v-bind="activatorProps"
        @click.stop
      />
    </template>
    <v-card class="pa-3" min-width="240">
      <template v-if="!custom">
        <div class="swatch-grid">
          <button
            v-for="entry in groupPalette"
            :key="entry.value"
            class="group-swatch large"
            :class="{ selected: entry.value.toLowerCase() === modelValue.toLowerCase() }"
            :style="{ backgroundColor: entry.value }"
            :title="entry.name"
            type="button"
            @click="pick(entry.value)"
          />
          <!-- Anything at all is allowed, the grid is just the shortlist. -->
          <button
            class="group-swatch large custom-trigger"
            title="Custom colour"
            type="button"
            @click="custom = true"
          >
            <i class="fas fa-plus" />
          </button>
        </div>

        <!-- What this browser has reached for before. Local only — see useGroupColorHistory. -->
        <template v-if="customColors.length">
          <div class="section-caption">Custom Colors</div>
          <div class="swatch-grid">
            <button
              v-for="color in customColors"
              :key="color"
              class="group-swatch large"
              :class="{ selected: color === modelValue.toLowerCase() }"
              :style="{ backgroundColor: color }"
              :title="color"
              type="button"
              @click="pick(color)"
            />
          </div>
        </template>
      </template>
      <template v-else>
        <v-color-picker
          v-model="draft"
          hide-inputs
          mode="hex"
          :modes="['hex']"
          width="216"
        />
        <!-- The shortlist simply omits red and amber; the custom picker can't, so it says why. -->
        <div class="colour-caution mt-2">
          <i class="fas fa-exclamation-triangle mr-1" />
          Please try not to use <span class="text-red">red</span> or <span class="text-orange">amber</span> — those are the "something is wrong" colours, and a
          group wearing one reads as a broken factory.
        </div>
        <div class="d-flex justify-space-between mt-2">
          <v-btn size="small" variant="text" @click="custom = false">Back</v-btn>
          <v-btn color="primary" size="small" variant="flat" @click="pick(draft)">Apply</v-btn>
        </div>
      </template>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { groupPalette } from '@/utils/colors'
  import { useGroupColorHistory } from '@/composables/useGroupColorHistory'

  const props = defineProps<{ modelValue: string }>()
  const emit = defineEmits<{ (event: 'update:modelValue', color: string): void }>()

  const open = ref(false)
  const custom = ref(false)
  const draft = ref(props.modelValue)

  // Reopening should start on the grid showing the colour the group actually has, not wherever
  // the last person left the picker.
  watch(open, isOpen => {
    if (!isOpen) return
    custom.value = false
    draft.value = props.modelValue
  })

  const { customColors, remember } = useGroupColorHistory()

  const pick = (color: string) => {
    // v-color-picker hands back #rrggbbaa in some modes; the alpha is meaningless here.
    const hex = color.slice(0, 7)
    remember(hex)
    emit('update:modelValue', hex)
    open.value = false
  }
</script>

<style lang="scss" scoped>
.group-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  cursor: pointer;
  flex: 0 0 auto;
  transition: transform 0.15s ease, border-color 0.15s ease;

  &:hover {
    transform: scale(1.15);
    border-color: #fff;
  }

  &.large {
    width: 28px;
    height: 28px;
  }

  &.selected {
    border: 2px solid #fff;
  }
}

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(6, 28px);
  gap: 8px;
}

.section-caption {
  margin: 12px 0 6px;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9e9e9e;
}

.colour-caution {
  max-width: 216px;
  font-size: 1rem;
  line-height: 1.3;
  color: #bdbdbd;
}

.custom-trigger {
  background-color: transparent;
  border-style: dashed;
  color: #ccc;
  font-size: 12px;
}
</style>
