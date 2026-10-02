<!-- What the pane shows while a factory is being built behind it: a ghost of that factory's card in
     shimmering blocks, so the switch reads as loading rather than as a blank screen.

     The header is drawn from the factory's own data on the same grid as the real one, so each
     block lands where the control it stands for will appear and the page does not jump when the
     card replaces it. Chips carry their real label as invisible text, which sizes them without
     measuring anything. The body below the fold is a rough outline: it is not on screen long
     enough to be read.

     The shimmer is a band sliding across each block on `transform`, which the browser animates
     off the main thread. The older placeholders animate `background-position`, which freezes for
     exactly as long as the factory behind them takes to mount — the one moment this is shown. -->
<template>
  <v-card
    class="factory-card ghost-card"
    :class="cardClass"
    data-testid="planner-page-skeleton"
    :style="groupStyle"
  >
    <v-row class="header">
      <v-col class="flex-grow-1" cols="auto" md="8">
        <div class="text-h4 text-md-h5 d-flex align-center">
          <span class="block ghost-icon-32" />
          <span class="block ghost-chip ghost-chip-tray" :class="{ 'ghost-chip-ungrouped': !factory?.group }">
            <span class="ghost-glyph ghost-glyph-folder" />
            <span class="ml-2 ghost-text">{{ factory?.group?.name ?? 'Ungrouped' }}</span>
          </span>
          <span class="ml-3 ghost-name">
            <span class="block ghost-text">{{ factory?.name || 'Factory Name' }}</span>
          </span>
        </div>
        <div class="d-flex align-center flex-wrap mt-1 ga-2">
          <!-- The status chips share one slot in the bar and wrap within it; every other chip is a
               slot of its own. -->
          <span
            v-for="(slot, slotIndex) in chipSlots"
            :key="slotIndex"
            :class="slot.status ? 'ghost-status-chips' : 'ghost-slot'"
          >
            <span
              v-for="(chip, index) in slot.chips"
              :key="index"
              class="block ghost-chip"
              :class="{ 'ghost-chip-pill': chip.pill, 'ghost-chip-plain': chip.plain }"
            >
              <span
                v-for="(width, glyph) in chip.glyphs"
                :key="glyph"
                class="ghost-glyph"
                :style="{ width: `${width}px`, height: `${Math.max(width, 14)}px` }"
              />
              <span class="ml-2 ghost-text">{{ chip.label }}</span>
              <span v-if="chip.info" class="ghost-glyph ghost-glyph-info ml-2" />
              <span v-if="chip.reset" class="ghost-glyph ghost-glyph-button ml-2" />
            </span>
          </span>
        </div>
      </v-col>
      <v-col class="text-right pt-0 pt-md-3" cols="auto" md="4">
        <span v-if="isDebugMode" class="block ghost-button" :class="smAndDown ? 'ghost-button-icon' : 'ghost-button-debug'" />
        <span v-for="button in 4" :key="button" class="block ghost-button ghost-button-icon" />
        <div class="d-flex justify-end mt-2">
          <span class="ghost-switch">
            <span class="block ghost-switch-track" />
            <span class="block ghost-switch-label" />
          </span>
        </div>
      </v-col>
    </v-row>
    <v-card-text class="ghost-body">
      <div class="ghost-heading-row">
        <div class="block ghost-heading" />
      </div>
      <div v-for="row in productRows" :key="row" class="block ghost-row" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { factoryStatusClass, getChipStatuses, getFactoryStatuses } from '@/utils/factory-management/status'
  import { countActiveTasks } from '@/utils/factory-management/factory'
  import { countChecklistCompleted, countChecklistDesynced, countChecklistTotal } from '@/utils/factory-management/checklist'
  import { getFactoryPowerShards, getFactorySomersloops } from '@/utils/statistics'
  import { formatMw } from '@/utils/numberFormatter'
  import { groupColorVars } from '@/utils/colors'
  import { useAppStore } from '@/stores/app-store'

  // The factory being opened, or null for the overview, which gets a plain outline.
  const props = defineProps<{ factory: Factory | null }>()

  const { isDebugMode } = useAppStore()
  const { smAndDown } = useDisplay()

  interface GhostChip {
    label: string
    // The widths of the icons ahead of the label: glyphs, or item art at 20px.
    glyphs: number[]
    // Pills are static readouts; the rest are squared like buttons.
    pill?: boolean
    // The unsynced chip is a stock chip rather than an sf-chip, so it is a different size.
    plain?: boolean
    // Trailing help icon and reset button on the sync chips.
    info?: boolean
    reset?: boolean
  }

  const statuses = computed(() => props.factory ? getFactoryStatuses(props.factory) : [])

  const cardClass = computed(() => ({
    grouped: !!props.factory?.group,
    ...factoryStatusClass(statuses.value),
  }))

  const groupStyle = computed(() =>
    props.factory?.group ? groupColorVars(props.factory.group.color) : undefined
  )

  // The chips bar of PlannerFactory.vue, in its order and with its labels and icon widths. Keep
  // the two in step: a chip missing here is a chip that shoves the bar sideways when the card lands.
  const statusChips = computed<GhostChip[]>(() =>
    getChipStatuses(statuses.value.filter(entry => entry.type !== 'outOfSync')).map(status => {
      const subjects = Math.min(status.subjects.length, 4)
      return { label: status.label, glyphs: subjects ? Array(subjects).fill(20) : [14], pill: !status.section }
    })
  )

  const chips = computed<GhostChip[]>(() => {
    const factory = props.factory
    if (!factory) return [{ label: 'Mark as in sync with game', glyphs: [12], plain: true, info: true }]
    const list: GhostChip[] = []

    const tasks = countActiveTasks(factory)
    if (tasks) list.push({ label: `Tasks: ${tasks}`, glyphs: [14] })
    if (factory.notes) list.push({ label: 'See notes', glyphs: [12] })
    if (factory.inSync) list.push({ label: 'In sync with game', glyphs: [12], info: true, reset: true })
    if (factory.inSync === false) list.push({ label: 'Out of sync with game', glyphs: [12], info: true, reset: true })
    if (factory.inSync === null) list.push({ label: 'Mark as in sync with game', glyphs: [12], plain: true, info: true })
    if (factory.checklistEnabled) {
      const desynced = countChecklistDesynced(factory)
      const suffix = desynced > 0 ? ` · ${desynced} to reconfirm` : ''
      list.push({ label: `Checklist: ${countChecklistCompleted(factory)}/${countChecklistTotal(factory)}${suffix}`, glyphs: [12] })
    }
    const powerDifference = (factory.power?.produced ?? 0) - (factory.power?.consumed ?? 0)
    if (powerDifference !== 0) list.push({ label: formatMw(Math.abs(powerDifference)), glyphs: [10, 14], pill: true })
    const boost = factory.power?.boostMw ?? 0
    if (boost > 0) list.push({ label: formatMw(boost), glyphs: [10, 14], pill: true })
    const shards = getFactoryPowerShards(factory)
    if (shards > 0) list.push({ label: String(shards), glyphs: [18], pill: true })
    const sloops = getFactorySomersloops(factory)
    if (sloops > 0) list.push({ label: String(sloops), glyphs: [18], pill: true })
    return list
  })

  const chipSlots = computed(() => [
    ...statusChips.value.length ? [{ status: true, chips: statusChips.value }] : [],
    ...chips.value.map(chip => ({ status: false, chips: [chip] })),
  ])

  // Enough to fill the pane below the header; what is under them is never seen.
  const productRows = computed(() => Math.max(2, Math.min(props.factory?.products.length ?? 3, 4)))
</script>

<style lang="scss" scoped>
.ghost-card {
  pointer-events: none;
}

.block {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
    transform: translateX(-100%);
    animation: skeleton-shimmer 1.4s infinite ease-in-out;
    will-change: transform;
  }
}

// Present for its width only.
.ghost-text {
  color: transparent;
  white-space: nowrap;
}

.ghost-icon-32 {
  flex: none;
  width: 32px;
  height: 32px;
}

// Matches .sf-chip.small: 32px tall, 10px padding inside a 2px border, 14px text.
.ghost-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  font-size: 14px;
  line-height: 1;
  vertical-align: middle;

  &.ghost-chip-pill {
    border-radius: 16px;
  }

  // A stock v-chip: 12px padding inside a 1px border, and a narrower leading icon.
  &.ghost-chip-plain {
    padding: 0 12.5px;
  }
}

.ghost-slot {
  display: contents;
}

.ghost-status-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

// The group tray chip and the name input share the title row by shrinking, as the real ones do:
// the input asks for 85% of the row, and the chip's overflow lets it give way too.
.ghost-chip-tray {
  flex: 0 1 auto;
  margin-left: 12px;

  &.ghost-chip-ungrouped {
    font-style: italic;
  }
}

.ghost-glyph {
  display: inline-block;
  flex: none;
  width: 12px;
  height: 14px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);

  &.ghost-glyph-folder {
    width: 14px;
  }

  &.ghost-glyph-info {
    width: 15px;
    height: 15px;
    border-radius: 50%;
  }

  // The x-small reset button, which runs into the chip's end padding.
  &.ghost-glyph-button {
    width: 32px;
    height: 24px;
    margin-right: -9px;
    border-radius: 12px;
  }
}

// The name input: 6px padding around a line of the title font, which the row sets, on 85% of
// the row.
.ghost-name {
  display: flex;
  flex: 0 1 auto;
  box-sizing: border-box;
  width: 85%;
  min-width: 0;
  padding: 6px;

  > .ghost-text {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
  }
}

.ghost-button {
  display: inline-block;
  vertical-align: middle;
  margin-right: 8px;

  &:last-of-type {
    margin-right: 0;
  }

  &.ghost-button-debug {
    width: 149px;
    height: 36px;
  }

  &.ghost-button-icon {
    width: 40px;
    height: 40px;
  }
}

// v-switch at density compact: a 40px row holding the track and its label.
.ghost-switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 40px;
}

.ghost-switch-track {
  width: 36px;
  height: 14px;
  border-radius: 7px;
}

.ghost-switch-label {
  width: 72px;
  height: 18px;
}

.ghost-heading-row {
  display: flex;
  align-items: center;
  height: 45px;
}

.ghost-heading {
  width: min(360px, 60%);
  height: 32px;
}

.ghost-row {
  height: 200px;
  margin-top: 16px;
}

@keyframes skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
