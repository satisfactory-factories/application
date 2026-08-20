<template>
  <!-- The wrapper exists to carry the tooltip mark. It is a data attribute rather than a `title`
       or a <v-tooltip> of its own: one delegated <game-asset-tooltip> at the app shell reads it on
       hover, so hundreds of images across a plan cost one overlay component between them. (A
       `title` would not have worked on the VImg anyway — it renders its own root and forwards
       attributes to an inner <img> that does not exist until the image loads.) -->
  <span
    class="game-asset-content"
    :data-hover-link="wiki ? '' : undefined"
    :data-hover-tooltip="title"
    :data-hover-tooltip-note="note || undefined"
  >
    <v-img
      v-if="!ficsmas && !unknown"
      :alt="subject"
      aspect-ratio="1/1"
      :max-height="heightPx"
      :max-width="widthPx"
      :min-height="heightPx"
      :min-width="widthPx"
      :src="imgUrl"
    />
    <v-icon v-if="ficsmas" icon="fas fa-snowflake" :style="{ width: widthPx + 'px', height: heightPx + 'px' }" />
    <v-icon v-if="unknown" icon="fas fa-question" :style="{ width: widthPx + 'px', height: heightPx + 'px' }" />
  </span>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { getCustomBuildingData, getCustomBuildingIcon } from '@/utils/factory-management/custom-buildings'

  // Props
  const props = defineProps<{
    subject: string
    height?: string | number | undefined
    width?: string | number | undefined
    type: 'building' | 'item' | 'item_id' | 'vehicle'
    title?: string
    // A second tooltip line, for a caller with something to add beyond the name.
    note?: string
    // Marks the image as a wiki link, so the tooltip can say so on its own line.
    wiki?: boolean
  }>()

  // State
  const ficsmas = ref(false)
  const unknown = ref(false)
  const gameData = useGameDataStore().getGameData()

  if (!gameData) {
    throw new Error('No game data provided to GameAssetContent!')
  }

  // Computed
  const widthPx = computed(() => {
    return parseInt(
      typeof props.width === 'number' ? props.width.toString() : props.width ?? '32',
      10
    )
  })

  const heightPx = computed(() => {
    return parseInt(
      typeof props.height === 'number' ? props.height.toString() : props.height ?? '32',
      10
    )
  })

  const imgSize = computed(() => widthPx.value > 64 || heightPx.value > 64 ? 'big' : 'small')
  const imgUrl = computed(() => getIcon(props.subject, props.type, imgSize.value))

  // Methods
  const sluggify = (subject: string): string => {
    // Converts CamelCase to kebab-case without adding dash at the beginning
    return subject.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/\s+/g, '-').toLowerCase()
  }

  const getIcon = (
    subject: string | null,
    type: 'building' | 'item' | 'item_id' | 'vehicle',
    size: 'small' | 'big' = 'small'
  ): string => {
    if (!subject) {
      console.error('No subject provided to getIcon!')
      return ''
    }
    if (type === 'building') {
      // Custom buildings (portals, stations, lights) have no building image — see
      // getCustomBuildingIcon. The few with no icon at all fall back to the same glyph an
      // unknown item gets, rather than requesting a file that isn't there.
      if (getCustomBuildingData(subject, gameData)) {
        const customIcon = getCustomBuildingIcon(subject)
        if (!customIcon) {
          unknown.value = true
          return ''
        }
        return getImageUrl(customIcon, 'item', size)
      }
      return getImageUrl(subject, 'building', size)
    } else if (type === 'item_id') {
      return getImageUrl(subject, 'item', size)
    } else if (type === 'vehicle') {
      return getImageUrl(subject, 'vehicle', size)
    } else {
      const partItem = gameData.items.parts[subject]
      const rawItem = gameData.items.rawResources[subject]

      // Freight cars are not in the items list
      if (!partItem && !rawItem && subject !== 'freight-car') {
        unknown.value = true
        return ''
      }

      // If a FICSMAS item, we don't have images for it so mark it as unknown
      if (partItem?.isFicsmas) {
        ficsmas.value = true
        return ''
      }

      const item = partItem?.name || rawItem?.name || subject

      return getImageUrl(sluggify(item), 'item', size)
    }
  }

  const getImageUrl = (
    name: string,
    type: 'building' | 'item' | 'vehicle',
    size: 'small' | 'big' = 'big'
  ): string => {
    const pxSize = size === 'small' ? 64 : 256
    return `/assets/game/${type}/${name}_${pxSize}.png`
  }
</script>

<style scoped>
/* Sized entirely by the image inside it — inline-flex so it neither adds a line box nor
   baseline-aligns, which would drop icons a few pixels inside chips. */
.game-asset-content {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
</style>
