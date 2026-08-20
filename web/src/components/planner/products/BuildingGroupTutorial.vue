<template>
  <v-dialog max-width="1200" :model-value="openTutorial" scrollable>
    <v-card>
      <v-card-title><h3 class="text-h3">Building Groups Tutorial</h3></v-card-title>
      <v-card-text class="verbage">
        <p>Building Groups turn a product's abstract building count into the real sets of machines you'd build in-game — each with its own building count, clock speed and Somersloops.</p>

        <v-divider />

        <h4 class="text-h4">Split into groups</h4>
        <p>Add a group per real-world set of machines, then set each group's building count. Handy when a constraint — pipe throughput, space — means you need to build the same product as separate physical clusters.</p>
        <img alt="Adding building groups and setting each group's building count" class="tutorial-gif" src="/assets/tutorials/building-groups-split.gif">

        <v-divider />

        <h4 class="text-h4">Overclocking</h4>
        <p>Clock a group up or down to change what it produces. <span class="text-amber">OC @ 100%</span> resets every group's clock in one click. Overclocking above 100% costs Power Shards (1 per building per 50% over), totalled on the Building Groups bar.</p>
        <img alt="Overclocking and underclocking a building group's clock speed" class="tutorial-gif" src="/assets/tutorials/building-groups-overclock.gif">

        <v-divider />

        <h4 class="text-h4">Somersloops</h4>
        <p><span class="text-purple">Somersloops</span> amplify a group's output — up to <b>double</b> per building — <b>without</b> using more ingredients, at the cost of a sharp rise in power usage. Slots per building depend on the building type (Constructors 1, Assemblers 2, Manufacturers 4).</p>
        <img alt="Adding Somersloops to a building group to amplify its output" class="tutorial-gif" src="/assets/tutorials/building-groups-somersloops.gif">

        <v-divider />

        <h4 class="text-h4">Fine tuning, balancing &amp; remainders</h4>
        <p>Type an exact output on any group and the building count/clock adjust to match — carve up a product however you like. If that leaves the item short or over, <span class="text-amber">Evenly balance</span> and the remainder buttons fix it in one click; hover each for what it does. They favour <b>adding buildings and underclocking</b> over overclocking, since overclocking costs Shards you may not have — make a new empty group instead if you want full manual control.</p>
        <img alt="Setting an exact group output, then rebalancing the remainder onto another group" class="tutorial-gif" src="/assets/tutorials/building-groups-fine-tuning.gif">

        <v-divider />

        <h4 class="text-h4">Sync</h4>
        <p>A product's first group starts with <b>Sync enabled</b>: editing the item rebalances its group, and editing the group updates the item's total — so a single-group product can be clocked from either end. <b>Adding a second group turns Sync off</b> so manual adjustments aren't overwritten (it stays off after deleting groups too); re-enable it any time.</p>
        <img alt="Editing an item's quantity with Sync enabled and watching its group update" class="tutorial-gif" src="/assets/tutorials/building-groups-sync.gif">

        <v-divider />

        <h4 class="text-h4">How "Effective Buildings" works</h4>
        <p>Effective Buildings is what all groups produce, expressed as buildings at 100% clock — so 5 buildings at 200% overclock count the same as 10 at 100%. It goes red the moment the groups don't add up to what the item needs; a 1% margin of error is allowed (configurable in Options) since some recipes can't hit exactly 100%.</p>
        <img alt="Trading building count for clock speed while Effective Buildings stays the same" class="tutorial-gif" src="/assets/tutorials/building-groups-effective-buildings.gif">
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="openTutorial = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import eventBus from '@/utils/eventBus'

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

.tutorial-gif {
  display: block;
  max-width: 100%;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}
</style>
