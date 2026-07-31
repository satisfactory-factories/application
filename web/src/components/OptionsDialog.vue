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

  <!-- One-time prompt for plans made before extraction existed. -->
  <v-dialog max-width="640" :model-value="showRawAssumptionPrompt" persistent>
    <v-card>
      <v-card-title>
        <i class="fas fa-hard-hat" /><span class="ml-2">{{ promptTitle }}</span>
      </v-card-title>
      <v-card-text class="text-body-2">
        <p v-if="isTemplatePrompt" class="mb-3">
          This plan mines everything it needs — the ore, the gas and the water are all extracted by
          buildings you can see in it. It reads best with the raw input assumption turned off, so
          anything you stop mining shows up as a shortage rather than being quietly filled in.
        </p>
        <template v-else>
          <p class="mb-3">
            You can now define mines inside your factories, or as dedicated mine factories, and export
            the raw ore anywhere in your plan. Pick a raw resource as a product, choose the extractor,
            and set each building group's miner mark and node purity.
          </p>
          <p class="mb-3">
            That replaces the old assumption that you were quietly supplying raw resources yourself —
            extraction is a full-class citizen now.
          </p>
        </template>
        <p class="mb-3">
          <b>Do you want that assumption removed across all your factories?</b> Raw resources you
          aren't mining or importing will then show as shortages.
        </p>
        <p class="text-medium-emphasis">
          You can change this at any time in Options, or on a per factory basis.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn id="raw-assumption-prompt-no" variant="flat" @click="answerRawAssumptionPrompt(false)">No</v-btn>
        <v-btn id="raw-assumption-prompt-yes" color="green" variant="flat" @click="answerRawAssumptionPrompt(true)">Yes</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/stores/app-store'

  const appStore = useAppStore()
  const { showRawAssumptionPrompt, rawAssumptionPromptReason } = storeToRefs(appStore)

  const isTemplatePrompt = computed(() => rawAssumptionPromptReason.value === 'template')
  const promptTitle = computed(() =>
    isTemplatePrompt.value ? 'This plan mines its own raw resources' : 'Mines are now part of the planner'
  )

  const showOptions = ref(false)
  const assumeRawInputs = appStore.getAssumeRawInputsSetting()

  const setAssumeRawInputs = (value: boolean) => {
    appStore.setAssumeRawInputsSetting(value)
  }

  const answerRawAssumptionPrompt = (removeAssumption: boolean) => {
    appStore.answerRawAssumptionPrompt(removeAssumption)
  }
</script>
