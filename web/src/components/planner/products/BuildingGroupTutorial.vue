<template>
  <v-dialog max-width="1000" :model-value="openTutorial" scrollable>
    <v-card>
      <v-card-title><h3 class="text-h3">Building Groups Tutorial</h3></v-card-title>
      <v-card-text class="verbage">
        <p>Building Groups enable you to do the following:</p>
        <ul class="ml-4">
          <li><b>Split up your factory into logical groups: </b> This is useful if you have a constraint, e.g. a series of pipes that you need to distrubte a raw resource e.g. oil amongst different groups.</li>
          <li><b><span class="text-amber">[Under/Over]clocking</span></b>: You are able to clock each group individually, which will update the amount produced by the group.</li>
          <li><b>COMING SOON <span class="text-purple">Somersloops</span></b>: You can indicate how many Somersloops are deployed in buildings, and how much it is producing.</li>
          <li><b>Fine tuning of resource distribution</b>: You can apply <b>exactly</b> how much of a given resource is consumed by the group, for maximum control.</li>
          <li><b>Auto-balancing and handling of remainders</b>: If you have a pre-existing group, you can create more groups and then redistribute the resources evenly, or apply the increased demand to the group you just made at a single button press.</li>
        </ul>

        <p>There are in effect two modes:</p>
        <ul class="ml-4">
          <li>
            <b>"Basic" mode:</b> Simply have one logical group, and your configuration will affect the entire product line. e.g. if you increase the number of buildings, it will adjust the line as well. This is the default mode. This enables you to clock all buildings on the line easily in one setting.</li>
          <li>
            <b>"Advanced" mode:</b> If you make multiple groups, we in effect give you direct manual control to make all the adjustments as you please. Note however that the auto correction of the product requirements and building groups are disabled, you will have to adjust manually and ensure the "Effective Buildings" is 0, otherwise the math will not balance. It will be obvious when the math doesn't add up. There is a 0.1 effective building margin of error before the tool yells at you to correct it.
          </li>
        </ul>

        <hr>

        <h3 class="text-h4">How "Effective Buildings" works</h3>
        <p>Effective Buildings is the number of buildings (after Clocking and Slooping) in terms of production that all Building Groups make. For example, if you had a product requiring 10 buildings worth of constructors to make an item, you can create Building Group of 5 buildings with 200% overclock to be effectively 10 buildings.</p>
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
