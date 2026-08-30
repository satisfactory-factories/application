<template>
  <component
    :is="clickable ? 'button' : 'span'"
    :aria-label="clickable ? titleText : undefined"
    class="factory-icon"
    :class="{ clickable }"
    :data-hover-tooltip="titleText"
    :style="boxStyle"
    :type="clickable ? 'button' : undefined"
    @click="emit('click', $event)"
  >
    <!-- Each variant gets its own wrapper Vue owns. FontAwesome's SVG replacement detaches
         the <i> and puts an <svg> in its place, so swapping a bare <i> for the image crashes
         the patch on a null parent — see the sync-state icons in PlannerFactoryList. -->
    <span v-if="resolved.kind === 'image'" class="factory-icon-variant" :style="boxStyle">
      <v-img
        :alt="resolved.name"
        aspect-ratio="1/1"
        :height="sizePx"
        :src="factoryIconAssetUrl(resolved.asset, sizePx)"
        :width="sizePx"
      />
    </span>
    <span
      v-else-if="resolved.kind === 'emoji'"
      class="factory-icon-variant factory-icon-emoji"
      :style="[boxStyle, glyphStyle]"
    >{{ resolved.char }}</span>
    <span v-else class="factory-icon-variant" :style="[boxStyle, glyphStyle]">
      <i class="fas fa-industry" />
    </span>
  </component>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { factoryIconAssetUrl, resolveFactoryIcon } from '@/utils/factory-icons'

  const props = withDefaults(defineProps<{
    // A factory-icons registry ID. Anything unrecognised renders the default industry glyph.
    icon?: string | null
    size?: string | number
    clickable?: boolean
    title?: string
  }>(), { size: 24 })

  const emit = defineEmits<{ (event: 'click', payload: MouseEvent): void }>()

  const resolved = computed(() => resolveFactoryIcon(props.icon))

  const sizePx = computed(() => {
    const parsed = parseInt(String(props.size), 10)
    return Number.isFinite(parsed) ? parsed : 24
  })

  const titleText = computed(() => {
    if (props.title) return props.title
    if (props.clickable) {
      return `Change icon (currently ${resolved.value.kind === 'default' ? 'default' : resolved.value.name})`
    }
    return resolved.value.kind === 'default' ? undefined : resolved.value.name
  })

  // A fixed square whatever the variant, so swapping an image for an emoji never nudges the
  // layout of the row it sits in.
  const boxStyle = computed(() => ({
    width: `${sizePx.value}px`,
    height: `${sizePx.value}px`,
  }))

  const glyphStyle = computed(() => ({ fontSize: `${Math.round(sizePx.value * 0.85)}px` }))
</script>

<style lang="scss" scoped>
// inline-flex, not inline-block: baseline alignment drops the icon a few px below the text it
// sits beside, which is visible against the factory name.
.factory-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  flex: 0 0 auto;
  line-height: 1;
}

// Positioned so it paints above the hover halo below, which is absolutely positioned and
// would otherwise cover the icon.
.factory-icon-variant {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

// The same affordance GameAsset.vue gives clickable item/building images, but drawn as a
// pseudo-element rather than padding + negative margin: that margin silently ate 4px off
// whatever spacing the caller set, so `mr-2` beside the icon rendered as 4px.
.clickable {
  position: relative;
  cursor: pointer;
  transition: transform 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  &:hover::before {
    background-color: rgba(0, 0, 0, 0.4);
  }

  &:focus-visible {
    outline: 2px solid #1976d2;
    outline-offset: 2px;
  }

  &:active {
    transform: scale(0.95);
  }
}
</style>
