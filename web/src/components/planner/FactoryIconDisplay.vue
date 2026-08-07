<template>
  <component
    :is="clickable ? 'button' : 'span'"
    class="factory-icon"
    :class="{ clickable }"
    :style="boxStyle"
    :title="titleText"
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

.factory-icon-variant {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

// The same affordance GameAsset.vue gives clickable item/building images: padding plus equal
// negative margin, so the hover fill gets a halo without taking any extra layout space.
.clickable {
  cursor: pointer;
  border-radius: 4px;
  // content-box so the halo is added around the icon rather than eaten out of it — the
  // app sets border-box globally, which would shrink a 20px icon to 12px.
  box-sizing: content-box;
  padding: 4px;
  margin: -4px;
  transition: background-color 0.2s ease, transform 0.2s ease;

  &:hover {
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
