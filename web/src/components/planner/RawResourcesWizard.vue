<template>
  <v-dialog max-width="1250" :model-value="modelValue" scrollable @update:model-value="close">
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
            each one — a shared mine factory per resource, extraction on the spot, or leave it as
            a shortage to deal with yourself.{{ ' ' }}
            <template v-if="columns.includes('import')">
              <b>Import</b> is offered where a factory in this plan already mines the resource, so
              you don't build a second mine next to the one you have.
            </template>
          </p>

          <p v-if="hasWellRows" class="mb-4 text-body-2 text-medium-emphasis">
            <i class="fas fa-exclamation-triangle mr-1" />
            Resource wells can't be set up for you — those rows are listed, but left alone.
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

          <v-table class="wizard-table" density="compact">
            <thead>
              <tr>
                <th>Resource</th>
                <th class="text-right">Short by</th>
                <th v-for="choice in columns" :key="choice" class="text-center choice-heading">
                  {{ choiceLabels[choice] }}
                </th>
              </tr>
            </thead>
            <!-- A tbody per factory: with a dozen factories short the flat list was a wall, and
                 the factory a row belongs to is the first thing you need to know. -->
            <tbody v-for="group in groupedRows" :key="group.factoryId" class="factory-group">
              <tr class="factory-row">
                <td :colspan="2 + columns.length">
                  <i class="fas fa-industry mr-2" /><b>{{ group.factoryName }}</b>
                  <span class="ml-2 text-caption text-medium-emphasis">
                    {{ group.rows.length }} {{ group.rows.length === 1 ? 'resource' : 'resources' }} short
                  </span>
                </td>
              </tr>
              <tr v-for="row in group.rows" :key="row.partId">
                <td>
                  <span class="d-flex align-center ga-2">
                    <game-asset :subject="row.partId" type="item" />
                    <span>{{ row.partName }}</span>
                  </span>
                </td>
                <td class="text-right text-no-wrap">{{ formatNumber(row.shortfall) }}/min</td>
                <!-- Wells are the one thing the wizard cannot build, so the row says so rather
                     than offering choices that don't apply. -->
                <td v-if="row.wellOnly" class="text-center" :colspan="columns.length">
                  <v-tooltip bottom max-width="420">
                    <template #activator="{ props: activatorProps }">
                      <v-chip v-bind="activatorProps" class="sf-chip hand-gathered x-small">
                        <i class="fas fa-exclamation-triangle mr-1" />
                        <span class="mr-1">Can't fix, requires manual intervention</span>
                        <i class="fas fa-info-circle" />
                      </v-chip>
                    </template>
                    <span>
                      {{ row.partName }} only comes out of a Resource Well, and the wizard can't
                      move it to one automatically.<br><br>
                      A well's output is decided by how many satellite nodes it covers and how pure
                      they are — something only you can know from your own map.<br><br>
                      Add a Resource Well Pressurizer as a product yourself, describe its
                      satellites, then export it to whatever needs feeding.
                    </span>
                  </v-tooltip>
                </td>
                <!-- The whole cell is the target, not just the 18px mark: a radio alone is a
                     fiddly thing to hit in a dense table. -->
                <td
                  v-for="choice in (row.wellOnly ? [] : columns)"
                  :key="choice"
                  class="text-center choice-cell"
                  :class="{ 'choice-cell--available': choicesForRow(row).includes(choice) }"
                  @click="selectChoice(row, choice)"
                >
                  <template v-if="choicesForRow(row).includes(choice)">
                    <v-radio
                      density="compact"
                      hide-details
                      :model-value="row.choice"
                      :value="choice"
                    />
                    <v-select
                      v-if="choice === 'import' && row.choice === 'import' && row.candidates.length > 1"
                      class="import-select mt-1"
                      density="compact"
                      hide-details
                      item-title="name"
                      item-value="id"
                      :items="row.candidates"
                      :model-value="row.importFrom"
                      variant="outlined"
                      @click.stop
                      @update:model-value="row.importFrom = $event"
                    />
                  </template>
                  <span v-else class="text-disabled">&mdash;</span>
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

  // Column order, and the header each one wears. Every row shows all four so the columns line up;
  // the ones a row can't use render as a dash.
  const ALL_CHOICES: WizardChoice[] = ['mine', 'onsite', 'import', 'ignore']

  const choiceLabels: Record<WizardChoice, string> = {
    mine: 'New mine factory',
    onsite: 'Mine it here',
    import: 'Import',
    ignore: 'Ignore',
  }

  const selectChoice = (row: WizardRow, choice: WizardChoice) => {
    if (choicesForRow(row).includes(choice)) {
      row.choice = choice
    }
  }

  const extractorLabel = computed(() =>
    `${getBuildingDisplayName(DEFAULT_EXTRACTOR.building)} on ${PURITY_LABELS[DEFAULT_EXTRACTOR.purity].toLowerCase()} nodes`)

  const actionableCount = computed(() => rows.value.filter(row => row.choice !== 'ignore').length)
  const hasWellRows = computed(() => rows.value.some(row => row.wellOnly))

  // Import only means anything when something in the plan already mines the resource, which is
  // never true on a first migration — the column was 30-odd rows of dashes. Drop it until it can
  // actually be picked.
  const columns = computed(() =>
    ALL_CHOICES.filter(choice => choice !== 'import' || rows.value.some(row => row.candidates.length > 0)))

  // Grouped for display only; the flat list stays the thing that gets applied.
  const groupedRows = computed(() => {
    const groups = new Map<number, { factoryId: number, factoryName: string, rows: WizardRow[] }>()
    for (const row of rows.value) {
      const group = groups.get(row.factoryId) ??
        { factoryId: row.factoryId, factoryName: row.factoryName, rows: [] }
      group.rows.push(row)
      groups.set(row.factoryId, group)
    }
    return [...groups.values()]
  })
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

<style lang="scss" scoped>
  .choice-heading {
    min-width: 96px;
  }

  // Each factory reads as its own block rather than every row running together.
  .factory-row td {
    background: rgba(255, 255, 255, 0.05);
  }

  .factory-group + .factory-group .factory-row td {
    border-top: 2px solid rgba(255, 255, 255, 0.14);
  }

  // Only the cells that can actually be picked look and behave clickable.
  .choice-cell--available {
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
    }
  }

  .choice-cell :deep(.v-selection-control) {
    justify-content: center;
  }

  .import-select {
    min-width: 150px;
  }
</style>
