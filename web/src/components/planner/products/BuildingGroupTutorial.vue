<template>
  <v-dialog max-width="1200" :model-value="openTutorial" scrollable>
    <v-card>
      <v-card-title><h3 class="text-h3">Building Groups Tutorial</h3></v-card-title>
      <v-card-text class="verbage">
        <p>Building Groups are a way for you to logically split up parts of the production line. A common practice is for pioneers to split up an input so it can be load balanced, because of throughput constraints (e.g. Crude Oil throughput limit of 600m3 in a single pipe), or space restrictions.</p>
        <h4 class="text-h4">What do they do?</h4>
        <ul class="ml-4">
          <li><b>Split up your factory into logical groups: </b> This is useful if you have a constraint, e.g. a series of pipes that you need to distribute a raw resource e.g. oil amongst different groups.</li>
          <li><b><span class="text-amber">[Under/Over]clocking</span></b>: You are able to clock each group individually, which will update the amount produced by the group.</li>
          <li><b>COMING SOON <span class="text-purple">Somersloops</span></b>: You can indicate how many Somersloops are deployed in buildings, and how much it is producing.</li>
          <li><b>Fine tuning of resource distribution</b>: You can apply <b>exactly</b> how much of a given resource is consumed by the group, for maximum control. You can carve it up however you like, from adjusting the output of the group, or the input of it, the building count and clock will be adjusted to accommodate.</li>
          <li><b>Balancing and remainder handling</b>: If you have a pre-existing group, using the buttons you can create more groups and then redistribute the resources evenly, or apply the increased demand to the group you just made at a single button press. Check the tooltips on each button to see what it does.</li>
        </ul>
        <p>When you click on Even Balance or any of the remainder buttons at the bottom, the tool will lean towards <b>adding more buildings and underclocking them</b> rather than overclocking, simply because the act of overclocking requires Shards that the player may not have. If this is undesirable, simply make a new empty group and you'll have full control and can overclock instead.</p>

        <v-divider />

        <h4 class="text-h4">Group Modes</h4>
        <p>
          <b>"Basic" mode:</b> By default, when you add a product, you will start with one logical group, and any changes to said group will affect the entire product line. e.g. if you increase the number of buildings, it will adjust the line as well and vice versa. This enables you to clock all buildings on the line easily in one go.
        </p>
        <img alt="Basic Mode" src="/assets/tutorials/building-group-basic.png">

        <p>
          <b>"Advanced" mode:</b> If you make multiple groups, the tool gives you full manual control to make all the adjustments as you please. Note however that the auto correction of the product requirements and building groups are disabled, you will have to adjust manually and ensure the "Effective Buildings" is 0, otherwise the math will not balance. You can use the helper buttons to help you do this. It will be very obvious when the math doesn't add up, and the factory will go red if it doesn't. <b>There is a 0.1 effective building margin of error</b> before the tool yells at you to correct it, as with some recipes it is simply not possible to be 100% balanced.
        </p>
        <img alt="Advanced Mode" src="/assets/tutorials/building-group-advanced.png">

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
