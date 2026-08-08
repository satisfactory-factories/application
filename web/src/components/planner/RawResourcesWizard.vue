<template>
  <v-dialog max-width="1100" :model-value="modelValue" scrollable @update:model-value="close">
    <v-card>
      <v-card-title class="d-flex align-center">
        <i class="fas fa-shovel" /><span class="ml-2">Raw Resources Wizard</span>
        <v-spacer />
        <v-btn icon="fas fa-times" size="small" variant="text" @click="close(false)" />
      </v-card-title>

      <v-card-text>
        <!-- Nothing to do -->
        <v-alert v-if="!rows.length" type="success" variant="tonal">
          Nothing to fix — every raw resource in this plan is either mined, imported, or one of the
          resources you gather by hand.
        </v-alert>

        <template v-else-if="!pending">
          <p class="mb-4 text-body-2">
            These factories need raw resources they don't extract or import. Choose how to cover
            each one — a shared mine factory per resource, extraction on the spot, an import from a
            factory that already mines it, or leave it as a shortage to deal with yourself.
          </p>

          <v-alert
            v-if="error"
            class="mb-4"
            :text="error"
            type="error"
            variant="tonal"
          />

          <div class="d-flex align-center ga-2 mb-4">
            <v-btn size="small" variant="outlined" @click="setAll('mine')">All to mine factories</v-btn>
            <v-btn size="small" variant="outlined" @click="setAll('onsite')">All on site</v-btn>
            <v-btn size="small" variant="outlined" @click="setAll('ignore')">Ignore all</v-btn>
          </div>

          <v-table density="compact">
            <thead>
              <tr>
                <th>Factory</th>
                <th>Resource</th>
                <th class="text-right">Short by</th>
                <th>What to do</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="`${row.factoryId}-${row.partId}`">
                <td>{{ row.factoryName }}</td>
                <td>
                  <span class="d-flex align-center ga-2">
                    <game-asset :subject="row.partId" type="item" />
                    <span>{{ row.partName }}</span>
                  </span>
                </td>
                <td class="text-right text-no-wrap">{{ formatNumber(row.shortfall) }}/min</td>
                <td>
                  <v-radio-group
                    density="compact"
                    hide-details
                    inline
                    :model-value="row.choice"
                    @update:model-value="row.choice = $event as WizardChoice"
                  >
                    <v-radio
                      v-for="choice in choicesForRow(row)"
                      :key="choice"
                      :label="choiceLabels[choice]"
                      :value="choice"
                    />
                  </v-radio-group>
                  <!-- Wells are the one thing the wizard can't build for you. -->
                  <div v-if="row.wellOnly" class="text-caption text-medium-emphasis">
                    Comes from a resource well — place the pressurizer and describe its satellites
                    yourself, then the plan can import from it.
                  </div>
                  <v-select
                    v-if="row.choice === 'import' && row.candidates.length > 1"
                    class="mt-2"
                    density="compact"
                    hide-details
                    item-title="name"
                    item-value="id"
                    :items="row.candidates"
                    label="Import from"
                    :model-value="row.importFrom"
                    style="max-width: 260px"
                    variant="outlined"
                    @update:model-value="row.importFrom = $event"
                  />
                </td>
              </tr>
            </tbody>
          </v-table>

          <p class="mt-4 text-caption text-medium-emphasis">
            New mines are built with {{ extractorLabel }}. Only the building count and power depend
            on that — the amount of ore is the same either way, so change the miners per group
            afterwards to match the nodes you actually have.
          </p>
        </template>

        <!-- Summary. Its numbers come from the run that is about to be committed, not from a
             second count of the same rows, so it cannot promise something else. -->
        <template v-else>
          <h3 class="text-h6 mb-3">Ready to apply</h3>
          <p class="mb-2">This will:</p>
          <ul class="ml-6 mb-4">
            <li v-if="pending.summary.minesCreated.length">
              Create <b>{{ pending.summary.minesCreated.length }}</b>
              {{ pending.summary.minesCreated.length === 1 ? 'mine factory' : 'mine factories' }} —
              {{ pending.summary.minesCreated.join(', ') }}
            </li>
            <li v-if="pending.summary.productsAdded">
              Add <b>{{ pending.summary.productsAdded }}</b>
              {{ pending.summary.productsAdded === 1 ? 'extraction product' : 'extraction products' }}
            </li>
            <li v-if="pending.summary.importsWired">
              Wire <b>{{ pending.summary.importsWired }}</b>
              {{ pending.summary.importsWired === 1 ? 'import' : 'imports' }}
            </li>
            <li v-if="ignoredCount">
              Leave <b>{{ ignoredCount }}</b>
              {{ ignoredCount === 1 ? 'shortage' : 'shortages' }} alone
            </li>
          </ul>
          <v-alert density="comfortable" type="warning" variant="tonal">
            There is no undo. Copy your plan to the clipboard first if you want a way back.
          </v-alert>
        </template>
      </v-card-text>

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn v-if="pending" variant="text" @click="pending = null">Back</v-btn>
        <v-btn v-else variant="text" @click="close(false)">Cancel</v-btn>
        <v-btn
          v-if="rows.length && !pending"
          color="primary"
          :disabled="!actionableCount"
          variant="flat"
          @click="review"
        >
          Review {{ actionableCount }} {{ actionableCount === 1 ? 'change' : 'changes' }}
        </v-btn>
        <v-btn
          v-if="pending"
          color="green"
          :disabled="applying"
          :loading="applying"
          variant="flat"
          @click="apply"
        >
          Apply
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { useAppStore } from '@/stores/app-store'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { formatNumber } from '@/utils/numberFormatter'
  import eventBus from '@/utils/eventBus'
  import {
    applyRawWizard,
    choicesForRow,
    collectRawWizardRows,
    DEFAULT_EXTRACTOR,
    WizardApplyResult,
    WizardChoice,
    WizardRow,
  } from '@/utils/factory-management/raw-wizard'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import { PURITY_LABELS } from '@/utils/factory-management/building-groups/extraction'

  const props = defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

  const appStore = useAppStore()
  const gameDataStore = useGameDataStore()

  const rows = ref<WizardRow[]>([])
  const pending = ref<WizardApplyResult | null>(null)
  const applying = ref(false)
  const error = ref('')

  const choiceLabels: Record<WizardChoice, string> = {
    mine: 'New mine factory',
    onsite: 'Mine it here',
    import: 'Import',
    ignore: 'Ignore',
  }

  const extractorLabel = computed(() =>
    `${getBuildingDisplayName(DEFAULT_EXTRACTOR.building)} on ${PURITY_LABELS[DEFAULT_EXTRACTOR.purity].toLowerCase()} nodes`)

  const actionableCount = computed(() => rows.value.filter(row => row.choice !== 'ignore').length)
  const ignoredCount = computed(() => rows.value.filter(row => row.choice === 'ignore').length)

  // Rebuild from the live plan every time it opens — the table is a snapshot, and a stale one
  // is exactly what the apply-time validation is there to reject.
  watch(() => props.modelValue, open => {
    if (!open) return
    rows.value = collectRawWizardRows(appStore.getFactories())
    pending.value = null
    error.value = ''
  }, { immediate: true })

  const setAll = (choice: WizardChoice) => {
    rows.value.forEach(row => {
      if (choicesForRow(row).includes(choice)) {
        row.choice = choice
      }
    })
  }

  // Runs the whole apply against a detached copy. Nothing in the plan changes until Apply commits
  // the result of THIS run, so the summary and the outcome cannot disagree.
  const review = () => {
    error.value = ''
    try {
      pending.value = applyRawWizard(
        appStore.getFactories(),
        rows.value,
        gameDataStore.getGameData(),
      )
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      pending.value = null
    }
  }

  const apply = () => {
    if (applying.value || !pending.value) return
    applying.value = true

    try {
      appStore.setFactories(pending.value.factories)
      eventBus.emit('toast', { message: 'Raw resources sorted!' })
      close(false)
    } finally {
      applying.value = false
    }
  }

  const close = (value = false) => {
    emit('update:modelValue', value)
  }
</script>
