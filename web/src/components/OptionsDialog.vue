<template>
  <!-- Default size, not `small`: it shares a bar with the sidebar toggle and the share
       button, and at small it rendered 28px tall against their 36 and 40. -->
  <v-btn
    id="options-button"
    color="grey-darken-1 rounded"
    prepend-icon="fas fa-wrench"
    variant="flat"
    @click="showOptions = true"
  >
    Options
  </v-btn>
  <v-dialog v-model="showOptions" max-width="640">
    <v-card>
      <v-card-title>
        <i class="fas fa-wrench" /><span class="ml-2">Options</span>
      </v-card-title>
      <v-card-text class="text-body-2">
        <h3 class="text-subtitle-1 font-weight-bold mb-1">Raw resources</h3>
        <p class="mb-3 text-medium-emphasis">
          Every raw resource has to be mined or imported. The wizard lists each factory that is
          short of one and offers to build the mines, add the extractors, or wire the imports for
          you. Run it whenever a new factory comes up short — it isn't only for migrating.
        </p>
        <v-btn
          id="run-raw-wizard"
          color="primary"
          prepend-icon="fas fa-shovel"
          variant="flat"
          @click="openWizard"
        >
          Run Raw Resources Wizard
        </v-btn>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="flat" @click="showOptions = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Styled like the update announcement: this changes how every plan reads, so it gets room
       to explain itself. Not persistent — dismissing it has to leave a usable plan. -->
  <v-dialog max-width="1000" :model-value="showRawBreakingNotice" scrollable @update:model-value="dismiss">
    <v-card>
      <v-card-title class="d-flex align-center pb-0">
        <span class="header-accent flex-grow-1 text-center">Breaking change</span>
      </v-card-title>
      <v-card-text>
        <h2 class="text-h4 text-center mb-4">Raw resources are no longer assumed</h2>
        <!-- Bound rather than a literal path: these live in public/, and a static src makes
             vite try to resolve them at transform time. -->
        <v-img
          :alt="activeExample.alt"
          class="mb-2 rounded"
          max-width="1200"
          :src="activeExample.image"
        />
        <div class="d-flex justify-center flex-wrap ga-2 mb-4">
          <v-btn
            v-for="example in examples"
            :key="example.key"
            :color="example.key === activeExampleKey ? 'primary' : undefined"
            size="small"
            :variant="example.key === activeExampleKey ? 'flat' : 'outlined'"
            @click="activeExampleKey = example.key"
          >
            {{ example.label }}
          </v-btn>
        </div>

        <p class="hero-blurb mb-4">
          You can now define mines inside your factories, or as dedicated mine factories, and
          export the raw ore anywhere in your plan.
        </p>

        <p class="mb-2">
          Pick a raw resource as a product, choose the extractor, and set each building group's
          miner mark and node purity — or describe a resource well by its satellite nodes.
        </p>

        <v-alert
          class="mt-6"
          density="comfortable"
          type="warning"
          variant="tonal"
        >
          <h3 class="text-h6 mb-2">What this means for your existing plans</h3>
          <p class="mb-2">
            The planner used to quietly assume you were supplying raw resources yourself. It
            doesn't any more — anything a factory doesn't mine or import is now a real shortage,
            so <b class="text-caution">plans built before this will show factories in red.</b>
            Nothing in your plan has been changed or lost; it is only being honest about what
            was already missing.
          </p>
          <p class="mb-2">
            There is no setting to turn this back on. An optional assumption meant two people
            could open the same plan and see different things, with nothing on screen to say so.
          </p>
          <p class="mb-0">
            The one exception is the resources the game gives you no extractor for — Leaves,
            Wood, Mycelia, alien remains, power slugs and FICSMAS gifts. Those are still taken
            as supplied, and say so on the item.
          </p>
        </v-alert>

        <p class="mt-4 mb-0">
          The <b>Raw Resources Wizard</b> can fix a plan in one pass: it lists every factory that
          is short, and builds the mines, adds the extractors or wires the imports for you. It
          lives in <b>Options</b> whenever you want it again.
        </p>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn id="raw-notice-dismiss" size="large" variant="text" @click="dismiss">
          I'll sort it myself
        </v-btn>
        <v-btn
          id="raw-notice-wizard"
          color="green"
          prepend-icon="fas fa-shovel"
          size="large"
          variant="flat"
          @click="dismissAndOpenWizard"
        >
          Run the wizard
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <raw-resources-wizard v-model="showWizard" />
</template>

<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/stores/app-store'
  import RawResourcesWizard from '@/components/planner/RawResourcesWizard.vue'

  const appStore = useAppStore()
  const { showRawBreakingNotice } = storeToRefs(appStore)

  // The three shapes extraction takes, so the modal can show what it is actually talking about.
  const examples = [
    {
      key: 'miners',
      label: 'Miners',
      image: '/assets/changelog/beta6/miners.png',
      alt: 'A mine mixing Miner Mk.3s on pure nodes with a Mk.2 on a normal one',
    },
    {
      key: 'well',
      label: 'Resource wells',
      image: '/assets/changelog/beta6/resource-well.png',
      alt: 'A resource well pressurizer with its satellite nodes by purity',
    },
    {
      key: 'water',
      label: 'Water',
      image: '/assets/changelog/beta6/water-extractor.png',
      alt: 'Water Extractors, which have no node purity',
    },
  ] as const

  const activeExampleKey = ref<typeof examples[number]['key']>('miners')
  const activeExample = computed(() =>
    examples.find(example => example.key === activeExampleKey.value) ?? examples[0])

  const showOptions = ref(false)
  const showWizard = ref(false)

  const openWizard = () => {
    showOptions.value = false
    showWizard.value = true
  }

  const dismiss = () => {
    appStore.dismissRawBreakingNotice()
  }

  const dismissAndOpenWizard = () => {
    dismiss()
    showWizard.value = true
  }
</script>

<style lang="scss" scoped>
  // Matches the update announcement's header and lead paragraph.
  .header-accent {
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    opacity: 0.7;
    text-transform: uppercase;
  }

  .hero-blurb {
    font-size: 1.35rem;
    line-height: 1.5;
  }

  // Not `.text-warning` — Vuetify already ships that as a theme colour class.
  .text-caution {
    color: var(--sf-warning);
  }
</style>
