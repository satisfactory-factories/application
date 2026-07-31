<template>
  <v-btn
    id="options-button"
    color="grey-darken-1 rounded"
    prepend-icon="fas fa-wrench"
    size="small"
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
        <v-switch
          id="assume-raw-inputs-toggle"
          color="primary"
          hide-details
          label="Assume raw resource inputs are supplied"
          :model-value="assumeRawInputs"
          @update:model-value="setAssumeRawInputs(!!$event)"
        />
        <p class="mt-2 text-medium-emphasis">
          When on, any raw resource a factory needs but isn't extracting or importing is assumed to
          be arriving from somewhere. When off it counts as a shortage, so you can plan your mines
          properly. Individual factories can override this in their Raw Resources section.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="flat" @click="showOptions = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Styled like the update announcement: this is a decision that changes how every factory
       in the plan reads, so it gets room to explain itself rather than a terse yes/no. -->
  <v-dialog max-width="1000" :model-value="showRawAssumptionPrompt" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex align-center pb-0">
        <span class="header-accent flex-grow-1 text-center">Raw resources</span>
      </v-card-title>
      <v-card-text>
        <h2 class="text-h4 text-center mb-4">{{ promptTitle }}</h2>
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

        <p v-if="promptReason === 'mines'" class="hero-blurb mb-4">
          This plan mines everything it needs — the ore, the gas and the water are all extracted
          by buildings you can see in it.
        </p>
        <p v-else-if="promptReason === 'assumes'" class="hero-blurb mb-4">
          Nothing in this plan mines anything: its ore, water and oil are taken as supplied, which
          is how every plan worked before mining existed.
        </p>
        <p v-else class="hero-blurb mb-4">
          You can now define mines inside your factories, or as dedicated mine factories, and
          export the raw ore anywhere in your plan.
        </p>

        <p class="mb-2">
          Pick a raw resource as a product, choose the extractor, and set each building group's
          miner mark and node purity — or describe a resource well by its satellite nodes. That
          replaces the old assumption that you were quietly supplying raw resources yourself.
        </p>

        <v-alert
          class="mt-6"
          density="comfortable"
          type="info"
          variant="tonal"
        >
          <h3 class="text-h6 mb-2">{{ promptQuestion }}</h3>
          <p class="mb-2">
            <b>Yes</b> — raw resources you aren't mining or importing become shortages, so the plan
            tells you what is missing. Best if you intend to plan your mining out.
            <b class="text-caution">This will likely result in a lot of factories in your plan
              going red, just so you're aware.</b>
          </p>
          <p class="mb-2">
            <b>No</b> — raw resources stay assumed as supplied, exactly as they are today. Nothing
            in your plan changes.
          </p>
          <p class="mb-0 text-medium-emphasis">
            Either way you can change it whenever you like in Options, or on a per factory basis.
          </p>
        </v-alert>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn id="raw-assumption-prompt-no" size="large" variant="text" @click="answerRawAssumptionPrompt(false)">
          No, keep assuming
        </v-btn>
        <v-btn
          id="raw-assumption-prompt-yes"
          color="green"
          size="large"
          variant="flat"
          @click="answerRawAssumptionPrompt(true)"
        >
          Yes, stop assuming
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/stores/app-store'

  const appStore = useAppStore()
  const { showRawAssumptionPrompt, rawAssumptionPromptReason } = storeToRefs(appStore)

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

  const promptReason = computed(() => rawAssumptionPromptReason.value)

  const promptTitle = computed(() => ({
    mines: 'This plan mines its own raw resources',
    assumes: 'This plan assumes its raw resources',
    migration: 'Mines are now part of the planner',
  }[promptReason.value]))

  // "Yes" always means "stop assuming", so an `assumes` plan is asking the opposite question
  // and has to say so the other way round.
  const promptQuestion = computed(() => promptReason.value === 'assumes'
    ? 'Do you want to stop assuming raw resources anyway?'
    : 'Do you want to stop assuming raw resources across all your factories?')

  const showOptions = ref(false)
  const assumeRawInputs = appStore.getAssumeRawInputsSetting()

  const setAssumeRawInputs = (value: boolean) => {
    appStore.setAssumeRawInputsSetting(value)
  }

  const answerRawAssumptionPrompt = (removeAssumption: boolean) => {
    appStore.answerRawAssumptionPrompt(removeAssumption)
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
