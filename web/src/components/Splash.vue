<template>
  <v-dialog v-model="showSplash" max-width="1000" scrollable>
    <v-card>
      <v-card-title class="text-h4 text-center pb-0">Alpha v0.5 - The "Overclocked" update!</v-card-title>
      <v-card-text>
        <p class="text-center mb-4">At long last, Overclocking &amp; Slooping has arrived!</p>

        <h2 class="text-h5 mb-2">
          🆕 <i class="fas fa-layer-group ml-1" /><span class="ml-2">Building Groups</span>
        </h2>
        <p class="mb-2">
          The headline feature of this update! Each product and power generator can now be split into <b>Building Groups</b>, letting you plan how your production lines are physically laid out in your world. Each group has its own building count and clock speed, and the planner keeps them in sync with your production targets.
        </p>
        <p class="mb-4">
          Open them via the new "Open Building Groups" bar underneath each product. With them come two long-requested features:
        </p>

        <h3 class="text-h6 mb-2 d-flex align-center">
          <game-asset height="24px" subject="power-shard" type="item_id" width="24px" /><span class="ml-2">Overclocking</span><span class="mx-2">&amp;</span><game-asset height="24px" subject="somersloop" type="item_id" width="24px" /><span class="ml-2">Somersloops</span>
        </h3>
        <p class="mb-2">
          Set a clock speed per group and the planner works out the power usage and the number of buildings you need. Slot Somersloops into your groups to amplify production — the planner correctly boosts output (not ingredient consumption!) and applies the increased power draw. The Power Shards and Somersloops required are totalled up for you at a glance.
        </p>
        <v-img
          alt="Overclocking and Somersloops"
          class="mb-4"
          max-width="1200"
          src="/assets/changelog/alpha5/overclocking.png"
        />

        <v-divider class="mb-4" />

        <h2 class="text-h5 mb-2">
          🆕 <i class="fas fa-hat-chef ml-1" /><span class="ml-2">Parts &amp; Recipes page</span>
        </h2>
        <p class="mb-2">
          The Recipes page has been reworked into <b>Parts &amp; Recipes</b>. Browse by part to see every recipe that produces it (with rates, building and power info), alternate recipes in their own dropdown, and everything the part is used in.
        </p>
        <p class="mb-4">
          It's plan-aware too: parts you already produce show an <b>"In Plan"</b> badge with your total output, chips jump you straight to the producing factory, and every recipe can be added to any factory (or a new one) via the <b>Add to Planner</b> button.
        </p>

        <v-divider class="mb-4" />

        <h2 class="text-h5 mb-2">
          <i class="fas fa-thumbs-up" /><span class="ml-2">Quality of Life</span>
        </h2>
        <ul class="ml-6 mb-4">
          <li>The factory list sidebar can now be resized, or collapsed entirely.</li>
          <li>Shortages in the Satisfaction section now have buttons to send them to a new or existing factory.</li>
        </ul>
        <p class="mb-4">Check the Change Log for further details.</p>

        <v-divider class="mb-4" />
        <h2 class="text-h5 mb-2">
          <i class="fas fa-wrench" /><span class="ml-2">Bugfixes</span>
        </h2>
        <p class="mb-4">A whole load of fixes were made. Check the change log for a full list.</p>

        <p class="text-center">You can see a full list of changes on the <v-btn color="primary" href="/changelog">Change Log</v-btn></p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" variant="elevated" @click="closeSplash">
          <i class="fas fa-check" /><span class="ml-2">Got it!</span>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  const key = 'seenV5Splash'
  const seenSplash = localStorage.getItem(key)
  const seenIntro = localStorage.getItem('dismissed-introduction') ?? 'false'
  // If the user has not seen the intro splash, don't show them this as there would be two splashes.

  const showSplash = ref<boolean>(seenSplash !== 'true' && seenIntro === 'true')

  // In case the user closes the dialog without clicking on the button
  watch(() => showSplash.value, value => {
    if (!value) {
      closeSplash()
    }
  })

  const closeSplash = () => {
    showSplash.value = false
    localStorage.setItem(key, 'true')
  }

</script>
