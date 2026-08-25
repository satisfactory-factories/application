<template>
  <a
    v-if="clickable && (type === 'item' || type === 'item_id' || type === 'building')"
    class="game-asset-clickable"
    :href="getWikiUrl(wikiName ?? displayName)"
    rel="noopener noreferrer"
    target="_blank"
  >
    <game-asset-content
      :height="height"
      :note="note"
      :subject="subject"
      :title="tooltip ?? wikiName ?? displayName"
      :type="type"
      :width="width"
      wiki
    />
  </a>
  <game-asset-content
    v-else
    :height="height"
    :note="note"
    :subject="subject"
    :title="tooltip ?? displayName"
    :type="type"
    :width="width"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { getWikiUrl } from '@/utils/wiki-links'
  import { getPartDisplayName } from '@/utils/helpers'
  import { findFactoryIconNameByAsset } from '@/utils/factory-icons'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import GameAssetContent from '@/components/GameAssetContent.vue'

  const props = defineProps<{
    subject: string
    height?: string | number | undefined
    width?: string | number | undefined
    type: 'building' | 'item' | 'item_id' | 'vehicle'
    clickable?: boolean
    // Wiki page name override for UI icons (e.g. the overclock glyph) whose subject
    // isn't a real part, so the display-name lookup can't produce a valid URL.
    wikiName?: string
    // Replaces the tooltip text, for a caller that has more to say about this icon than its
    // name. Wrapping the icon in a second tooltip instead gives the hover two answers, since
    // HoverTooltip resolves the innermost marked ancestor.
    tooltip?: string
    // An extra tooltip line under that text, for something the icon carries but cannot say — a
    // badge drawn in its corner. Kept separate because the tooltip escapes markup on purpose.
    note?: string
  }>()

  // `item_id` icons are named by their asset file, not by a game data key, so the lookup below
  // missed them and the hover read "UNKNOWN PART power-shard!". The Power Shard's item is
  // CrystalShard; these two have no game data entry and no icon registry entry either.
  const itemIdAliases: Record<string, string> = { 'power-shard': 'CrystalShard' }
  const nameOverrides: Record<string, string> = {
    'overclock-production': 'Clock speed',
    'somersloop-trinket': 'Somersloop',
    // A collectable rather than a part, so it is in neither the game data nor the icon registry.
    'mercer-sphere': 'Mercer Sphere',
  }

  const displayName = computed(() => {
    if (props.type === 'item' || props.type === 'item_id') {
      const override = nameOverrides[props.subject]
      if (override) return override

      // Buildings shown as items (the extractors) are in the icon registry but not in game data,
      // so ask the registry before giving up on the name.
      const name = getPartDisplayName(itemIdAliases[props.subject] ?? props.subject)
      return name.startsWith('UNKNOWN PART')
        ? findFactoryIconNameByAsset(`item/${props.subject}`) ?? name
        : name
    } else if (props.type === 'building') {
      return getBuildingDisplayName(props.subject)
    }
    return props.subject
  })
</script>

<style scoped>
.game-asset-clickable {
  /* inline-flex, not inline-block: the anchor must not baseline-align, or wrapped
     icons sit visibly higher than bare (non-clickable) ones in the same chip. */
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  cursor: pointer;
  text-decoration: none;
  border-radius: 4px;
  /* Padding + equal negative margin: the hover fill gets a halo around the image
     without the anchor taking up any extra layout space. */
  padding: 4px;
  margin: -4px;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

/* Button-style hover: a darker fill behind the icon signals clickability without
   resizing it — a hover scale made clickable icons look a different size to the
   non-clickable ones beside them. */
.game-asset-clickable:hover {
  background-color: rgba(0, 0, 0, 0.4);
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
