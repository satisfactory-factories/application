<template>
  <v-dialog max-width="1200" :model-value="openTutorial" scrollable>
    <v-card>
      <v-card-title><h3 class="text-h3">Building Groups Tutorial</h3></v-card-title>
      <v-card-text class="verbage">
        <p>Building Groups turn a product's abstract building count into the real sets of machines you'd build in-game. A common practice is for pioneers to split up an input so it can be load balanced, because of throughput constraints (e.g. Crude Oil throughput limit of 600m3 in a single pipe), or space restrictions. Each group has its own building count, clock speed and Somersloops.</p>
        <h4 class="text-h4">What do they do?</h4>
        <ul class="ml-4">
          <li><b>Split up your factory into logical groups: </b> This is useful if you have a constraint, e.g. a series of pipes that you need to distribute a raw resource e.g. oil amongst different groups.</li>
          <li><b><span class="text-amber">[Under/Over]clocking</span></b>: You are able to clock each group individually, which will update the amount produced by the group. The Power Shards needed are totalled up on the Building Groups bar (1 per building per 50% clock above 100%).</li>
          <li><b><span class="text-purple">Somersloops</span></b>: You can slot Somersloops into each group's buildings to amplify production — see below for the details.</li>
          <li><b>Fine tuning of resource distribution</b>: You can apply <b>exactly</b> how much of a given resource is consumed by the group, for maximum control. You can carve it up however you like, from adjusting the output of the group, or the input of it, the building count and clock will be adjusted to accommodate.</li>
          <li><b>Balancing and remainder handling</b>: If you have a pre-existing group, using the buttons you can create more groups and then redistribute the resources evenly, or apply the increased demand to the group you just made at a single button press. Check the tooltips on each button to see what it does.</li>
        </ul>
        <p>When you click on Evenly balance or any of the remainder buttons, the tool will lean towards <b>adding more buildings and underclocking them</b> rather than overclocking, simply because the act of overclocking requires Shards that the player may not have. If this is undesirable, simply make a new empty group and you'll have full control and can overclock instead.</p>

        <v-divider />

        <h4 class="text-h4">Sync</h4>
        <p>
          When you add a product it starts with one group, with <b>Sync enabled</b>: editing the <b>item</b> rebalances its groups evenly, and editing a <b>group</b> updates the item's totals — so you can e.g. clock the entire line in one go.
        </p>
        <p>
          <b>Adding a second group turns Sync off</b> so your manual adjustments aren't overwritten (it stays off after deleting groups). You then have full manual control, and it's up to you to ensure the groups cover the item's demand — keep an eye on the "Effective Buildings" readout and use the helper buttons to rebalance. It will be very obvious when the math doesn't add up: the Building Groups bar goes red. <b>There is a 0.1 effective building margin of error</b> before the tool yells at you to correct it, as with some recipes it is simply not possible to be 100% balanced. You can re-enable Sync at any time to restore automatic syncing.
        </p>

        <v-divider />

        <h4 class="text-h4">Somersloops</h4>
        <p>Each building has a number of Somersloop slots depending on its type (e.g. Constructors 1, Assemblers 2, Manufacturers 4). Filling slots boosts each building's <b>output</b> — up to <b>double</b> when fully slooped — <b>without increasing ingredient consumption</b>, at the cost of drastically increased power usage (power scales with the square of the amplification, on top of any overclock). The total Somersloops used are shown on the Building Groups bar so you know exactly how many you're committing.</p>

        <v-divider />

        <h4 class="text-h4">How "Effective Buildings" works</h4>
        <p>Effective Buildings is the number of buildings (after Clocking and Slooping) in terms of <b>production</b> that all Building Groups output. For example, if you had a product requiring 10 buildings worth of constructors to make an item, you can create Building Group of 5 buildings with 200% overclock to be effectively 10 buildings.</p>
        <p><span class="text-amber font-weight-bold">NOTE:</span> In some scenarios it is simply not possible to get effective buildings to be exactly zero, so we expect you to <i>slightly</i> overproduce. The tool will do it's best to balance things for you, should you request it.</p>
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
</style>
