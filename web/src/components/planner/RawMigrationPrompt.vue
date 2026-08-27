<template>
  <!-- Only raised for a plan that predates the change and is actually short, so it speaks about
       this plan rather than the release. Not persistent — dismissing it has to leave a usable
       plan. -->
  <app-dialog
    card-class="action-card"
    close-title="Dismiss this notice"
    max-width="1000"
    :model-value="showRawBreakingNotice"
    scrollable
    @update:model-value="dismiss"
  >
    <template #title>
      <span class="action-headline flex-grow-1 text-center">Action needed</span>
    </template>

    <h3 class="text-h5 text-center text-medium-emphasis mb-4">
      Raw resource migration required
    </h3>

    <p class="hero-blurb mb-4">
      This plan has raw resources that are not being properly accounted for (extracted out of the ground) so its factories are
      now showing red. Hit <b>Run the wizard</b> below to fix that and bring the plan up to date.
    </p>

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

    <p class="mb-2">
      The planner used to assume you were supplying raw resources yourself. It doesn't any
      more: anything a factory doesn't mine or import is a real shortage. Nothing in your plan
      has been changed or lost, you just now need to fill the gaps that already existed.
    </p>

    <p class="mb-2">
      You can produce raw materials as a product inside the factory that needs them, or build a
      dedicated mine factory and export to whatever needs feeding. Pick a raw resource as a
      product e.g. "Iron Ore" and set each building group's miner mark and node purity,
      or describe a resource well by its satellite nodes.
    </p>

    <p class="mb-0">
      The wizard lists every factory that is short and builds the mines, adds the extractors or
      wires the imports for you. It lives in <b>Options</b> located top right of the
      planner whenever you want it again.
    </p>

    <template #actions>
      <!-- A real button, but the muted grey the rest of the app uses for secondary actions:
           it has to be findable without competing with the wizard. -->
      <v-btn
        id="raw-notice-dismiss"
        color="grey-darken-1"
        size="large"
        variant="flat"
        @click="dismiss"
      >
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
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/stores/app-store'
  import eventBus from '@/utils/eventBus'

  const appStore = useAppStore()
  const { showRawBreakingNotice } = storeToRefs(appStore)

  // The three shapes extraction takes, so the prompt can show what it is actually talking about.
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

  const dismiss = () => {
    appStore.dismissRawBreakingNotice()
  }

  // The wizard is mounted once, by OptionsDialog; asking through the bus rather than mounting a
  // second copy here.
  const dismissAndOpenWizard = () => {
    dismiss()
    eventBus.emit('openRawWizard')
  }
</script>

<style lang="scss" scoped>
  // The plan is reporting shortages until this is answered, so the dialog is edged in the same
  // error colour its headline wears rather than sitting in the ordinary card border.
  // `:deep`, because the card belongs to <app-dialog>'s template rather than this one, so the
  // scope id lands on the overlay root above it and not on the card itself.
  :deep(.action-card) {
    border: 2px solid var(--sf-error);
  }

  // The headline, not a kicker: the plan is reporting shortages until this is answered, so it
  // leads in the error colour rather than sitting above the real title in grey.
  .action-headline {
    color: var(--sf-error);
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .hero-blurb {
    font-size: 1.35rem;
    line-height: 1.5;
  }
</style>
