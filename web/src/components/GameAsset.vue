<template>
  <a
    v-if="clickable && (type === 'item' || type === 'item_id' || type === 'building')"
    class="game-asset-clickable"
    :href="getWikiUrl(displayName)"
    rel="noopener noreferrer"
    :style="{ cursor: 'pointer', display: 'inline-block', textDecoration: 'none' }"
    target="_blank"
    :title="`Open ${displayName} on Satisfactory Wiki`"
  >
    <game-asset-content
      :height="height"
      :subject="subject"
      :type="type"
      :width="width"
    />
  </a>
  <game-asset-content
    v-else
    :height="height"
    :subject="subject"
    :type="type"
    :width="width"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { getWikiUrl } from '@/utils/wiki-links'
  import { getPartDisplayName } from '@/utils/helpers'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import GameAssetContent from '@/components/GameAssetContent.vue'

  const props = defineProps<{
    subject: string
    height?: string | number | undefined
    width?: string | number | undefined
    type: 'building' | 'item' | 'item_id' | 'vehicle'
    clickable?: boolean
  }>()

  const displayName = computed(() => {
    if (props.type === 'item' || props.type === 'item_id') {
      return getPartDisplayName(props.subject)
    } else if (props.type === 'building') {
      return getBuildingDisplayName(props.subject)
    }
    return props.subject
  })
</script>

<style scoped>
.game-asset-clickable {
  transition: transform 0.1s ease, opacity 0.1s ease;
}

.game-asset-clickable:hover {
  transform: scale(1.05);
  opacity: 0.8;
}

.game-asset-clickable:focus {
  outline: 2px solid #1976d2;
  outline-offset: 2px;
  border-radius: 4px;
}

.game-asset-clickable:active {
  transform: scale(0.95);
}
</style>
