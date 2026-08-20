<template>
  <v-dialog max-width="900" :model-value="openTutorial" scrollable>
    <v-card>
      <v-card-title><h3 class="text-h3">Sinking a surplus</h3></v-card-title>
      <v-card-text class="verbage">
        <p>
          An AWESOME Sink destroys whatever reaches it, so setting one on an item tells the planner
          the item's whole surplus is gone. The item stops counting as a backlog, and the sink's
          <b>30 MW</b> each is added to the factory's power.
        </p>
        <p>
          That only holds if you build it the way the planner reads it. Two assumptions, and the
          numbers here are wrong if your factory breaks either.
        </p>

        <v-divider />

        <h4 class="text-h4">1. Send it the excess, not half the line</h4>
        <p>
          The planner assumes a <b>Programmable Splitter</b> feeding the sink, with the sink on its
          overflow output so it only ever receives what nothing else took.
        </p>
        <p>
          A plain splitter does something quite different: it divides the belt evenly between its
          outputs, so putting a sink on one of them destroys a fixed share of your production rather
          than the surplus. The planner has no way to see which you built, and every figure on this
          page assumes the first one.
        </p>

        <v-divider />

        <h4 class="text-h4">2. The belt has to keep up</h4>
        <p>
          A sink eats as fast as the belt delivers, so the belt feeding it has to carry the whole
          surplus. A Mk.1 belt carries 60/min. Put one in front of a 720/min surplus and 660/min of
          it still backs up, however green this planner says the item is.
        </p>
        <p>
          Check the surplus figure against the belt tier you have actually run to the sink, and
          upgrade the belt or split across several sinks if it falls short.
        </p>

        <v-divider />

        <h4 class="text-h4">What about the Dimensional Depot?</h4>
        <p>
          An item can have both, and the two figures are not a split of the surplus. The sink takes
          all of it. A Depot Uploader is a buffer on the same line that fills, then backs up until
          you spend what is in it, and nothing here can know when you do. So <b>Into Depot</b> shows
          what the plan has spare rather than a rate it sustains, which is why an item that is also
          sunk shows the same number in both places.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="openTutorial = false">Got it</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import eventBus from '@/utils/eventBus'

  const openTutorial = ref(false)

  eventBus.on('openAwesomeSinkTutorial', () => {
    openTutorial.value = true
  })
</script>

<style scoped lang="scss">
.verbage {
  * {
    margin-bottom: 1rem;
  }
}
</style>
