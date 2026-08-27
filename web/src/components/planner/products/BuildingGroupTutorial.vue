<template>
  <v-dialog max-width="1200" :model-value="openTutorial" scrollable>
    <v-card>
      <v-card-title><h3 class="text-h3"><i class="fas fa-layer-group mr-2" />Building Groups Tutorial</h3></v-card-title>
      <v-card-text class="verbage">
        <p>Building Groups turn a product's abstract building count into the real sets of machines you'd build in-game, each with its own building count, clock speed and Somersloops.</p>

        <nav aria-label="Tutorial contents" class="tutorial-toc">
          <v-chip
            v-for="section in sections"
            :key="section.id"
            link
            size="small"
            variant="tonal"
            @click="scrollToSection(section.id)"
          >
            {{ section.label }}
          </v-chip>
        </nav>

        <v-divider />

        <h4 :id="`${TOC_PREFIX}-split`" class="text-h4">Split into groups</h4>
        <p>Add a group per real-world set of machines, then set each group's building count. Handy when a constraint (pipe throughput, space) means you need to build the same product as separate physical clusters.</p>
        <MediaPlayer
          label="Adding building groups and setting each group's building count"
          src="/assets/tutorials/building-groups-split.mp4"
        />

        <v-divider />

        <h4 :id="`${TOC_PREFIX}-sync`" class="text-h4">Sync</h4>
        <v-alert class="mb-4" color="primary" icon="fas fa-bolt" variant="tonal">
          <b>Sync instantly updates the item's quantity to match its building groups.</b> Any change you make to a group (building count, clock) updates the item automatically, no extra step needed.
        </v-alert>
        <p>A product's first group starts with Sync enabled: editing the item rebalances its group, and editing the group updates the item's total, so a single-group product can be clocked from either end. <b>Adding a second group turns Sync off</b> so manual adjustments aren't overwritten (it stays off after deleting groups too); re-enable it any time.</p>
        <MediaPlayer
          label="Editing a building group and watching the item's quantity update automatically"
          src="/assets/tutorials/building-groups-sync.mp4"
        />

        <v-divider />

        <h4 :id="`${TOC_PREFIX}-overclocking`" class="text-h4">Overclocking</h4>
        <p>Clock a group up or down to change what it produces. <span class="text-amber">OC @ 100%</span> resets every group's clock in one click. Overclocking above 100% costs Power Shards (1 per building per 50% over), totalled on the Building Groups bar.</p>
        <MediaPlayer
          label="Overclocking and underclocking a building group's clock speed"
          src="/assets/tutorials/building-groups-overclock.mp4"
        />

        <v-divider />

        <h4 :id="`${TOC_PREFIX}-somersloops`" class="text-h4">Somersloops</h4>
        <p><span class="text-purple">Somersloops</span> amplify a group's output, up to <b>double</b> per building, <b>without</b> using more ingredients, at the cost of a sharp rise in power usage. Slots per building depend on the building type (Constructors 1, Assemblers 2, Manufacturers 4).</p>
        <MediaPlayer
          label="Adding Somersloops to a building group and watching power usage and output rise"
          src="/assets/tutorials/building-groups-somersloops.mp4"
        />

        <v-divider />

        <h4 :id="`${TOC_PREFIX}-fine-tuning`" class="text-h4">Fine tuning, balancing &amp; remainders</h4>
        <p>Type in the output on any group, and the building count and clock will adjust to match. This lets you precisely balance or distribute a product's production based on your circumstances. You can also evenly balance the groups, or send the remainder of one group to the last.</p>
        <MediaPlayer
          label="Setting an exact group output, then rebalancing the remainder onto another group"
          src="/assets/tutorials/building-groups-fine-tuning.mp4"
        />

        <v-divider />

        <h4 :id="`${TOC_PREFIX}-effective-buildings`" class="text-h4">How "Effective Buildings" works</h4>
        <p>Effective Buildings is what all groups produce, expressed as buildings at 100% clock, so 5 buildings at 200% overclock count the same as 10 at 100%. It goes red the moment the groups don't add up to what the item needs; a 1% margin of error is allowed (configurable in Options) since some recipes can't hit exactly 100%.</p>
        <MediaPlayer
          label="Trading building count for clock speed while Effective Buildings stays the same"
          src="/assets/tutorials/building-groups-effective-buildings.mp4"
        />
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" variant="flat" @click="openTutorial = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import MediaPlayer from '@/components/common/MediaPlayer.vue'
  import eventBus from '@/utils/eventBus'

  // Ids are built from this so the headings and the contents list can never drift apart.
  const TOC_PREFIX = 'building-group-tutorial'
  const sections = [
    { id: `${TOC_PREFIX}-split`, label: 'Split into groups' },
    { id: `${TOC_PREFIX}-sync`, label: 'Sync' },
    { id: `${TOC_PREFIX}-overclocking`, label: 'Overclocking' },
    { id: `${TOC_PREFIX}-somersloops`, label: 'Somersloops' },
    { id: `${TOC_PREFIX}-fine-tuning`, label: 'Fine tuning, balancing & remainders' },
    { id: `${TOC_PREFIX}-effective-buildings`, label: 'How "Effective Buildings" works' },
  ]

  // scrollIntoView walks up to the nearest scrollable ancestor, which inside a
  // `scrollable` v-dialog is the v-card-text, so this moves the modal's own scroll
  // position rather than the page behind it. scroll-margin-top on the headings keeps
  // the target off the very top edge.
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openTutorial = ref(false)

  eventBus.on('openBuildingGroupTutorial', () => {
    console.log('openBuildingGroupTutorial')
    openTutorial.value = true
  })
</script>

<style scoped lang="scss">
.verbage {
  * {
    margin-bottom: 1rem;
  }

  li {
    margin-bottom: 0 !important;
  }
}

.tutorial-toc {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  // .verbage puts a 1rem bottom margin on every descendant, which would space the
  // chips apart vertically on top of the flex gap.
  * {
    margin-bottom: 0;
  }
}

// Headings are scroll targets; without this the one you jump to sits flush against
// the top edge of the dialog's scroll area.
h4[id^="building-group-tutorial-"] {
  scroll-margin-top: 12px;
}
</style>
