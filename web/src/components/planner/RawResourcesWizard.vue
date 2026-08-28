<template>
  <app-dialog
    icon="fas fa-shovel"
    max-width="1250"
    :model-value="modelValue"
    scrollable
    title="Raw Resources Wizard"
    @update:model-value="close"
  >
    <!-- Nothing to do -->
    <v-alert v-if="!rows.length" type="success" variant="tonal">
      Nothing to fix: every raw resource in this plan is either mined, imported, or one of the
      resources you gather by hand.
    </v-alert>

    <template v-else-if="!pending">
      <p class="mb-4 text-body-2">
        The below factories are lacking raw resources. Choose how to cover each one: produce them on site, or import them in from
        a dedicated mine factory.
        <template v-if="columns.includes('import')">
          <b>Import</b> is offered where a factory in this plan already mines the resource, so
          you don't build a second mine next to the one you have.
        </template>
      </p>

      <p v-if="hasWellRows" class="mb-4 text-body-2 text-medium-emphasis">
        <i class="fas fa-exclamation-triangle mr-1" />
        Resource wells can't be set up for you due to their complexity with Satellites. Those rows are listed, but left alone.
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
                  they are, something only you can know from your own map.<br><br>
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
        on that. The amount of ore is the same either way, so change the miners per group
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
          {{ pending.summary.minesCreated.length === 1 ? 'mine factory' : 'mine factories' }}:
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

      <!-- Where new factories land matters on a long plan: appended to the bottom they are
           out of sight, which is where a migration's output is least useful. -->
      <div v-if="pending.summary.minesCreated.length" class="placement mb-4 pa-3 rounded">
        <p class="mb-2">
          You are adding <b>{{ pending.summary.minesCreated.length }}</b> new
          {{ pending.summary.minesCreated.length === 1 ? 'factory' : 'factories' }}. Where would
          you like them on the plan?
        </p>
        <v-btn-toggle
          v-model="placement"
          color="primary"
          density="compact"
          mandatory
          variant="outlined"
        >
          <v-btn prepend-icon="fas fa-arrow-up" value="top">Top of the plan</v-btn>
          <v-btn append-icon="fas fa-arrow-down" value="bottom">Bottom of the plan</v-btn>
        </v-btn-toggle>
      </div>

      <v-table class="wizard-table review-table" density="compact">
        <thead>
          <tr>
            <th>Item</th>
            <th class="text-right">Produced</th>
            <th>Imports from</th>
            <th>Exports to</th>
          </tr>
        </thead>
        <tbody
          v-for="plan in pending.summary.factories"
          :key="plan.factoryId"
          class="factory-group"
          :class="plan.isNew ? 'factory-group--new' : 'factory-group--modified'"
        >
          <tr class="factory-row">
            <td colspan="4">
              <span class="d-flex align-center ga-2">
                <i class="fas fa-industry" />
                <!-- Renaming here rather than after the fact: the wizard's own names for the
                     mines it built are the ones most worth changing, and this is the last
                     moment before they are committed. -->
                <template v-if="editingId === plan.factoryId">
                  <v-text-field
                    ref="renameField"
                    v-model="editingName"
                    autofocus
                    class="rename-field"
                    density="compact"
                    hide-details
                    variant="outlined"
                    @blur="commitRename(plan.factoryId)"
                    @keydown.enter="commitRename(plan.factoryId)"
                    @keydown.esc="editingId = null"
                  />
                </template>
                <template v-else>
                  <b>{{ plan.factoryName }}</b>
                  <v-btn
                    density="compact"
                    icon="fas fa-pencil"
                    size="x-small"
                    :title="`Rename ${plan.factoryName}`"
                    variant="text"
                    @click="startRename(plan)"
                  />
                </template>
                <v-chip v-if="plan.isNew" class="sf-chip green x-small no-margin">New factory</v-chip>
                <v-chip v-else class="sf-chip status-warning-outlined x-small no-margin">Modified</v-chip>
              </span>
            </td>
          </tr>
          <!-- Every cell is a stack of fixed-height lines, so the item, its rate and the
               first factory it goes to sit on the same line as each other. -->
          <tr v-for="line in factoryLines(plan)" :key="line.partId">
            <td>
              <span class="cell-line ga-2">
                <game-asset :subject="line.partId" type="item" />
                <span :class="{ 'item-name--new': line.isNew }">{{ line.partName }}</span>
                <v-chip v-if="line.change" class="sf-chip x-small no-margin" :class="changeClass(line.change)">
                  {{ changeLabels[line.change] }}
                </v-chip>
              </span>
            </td>
            <td class="text-no-wrap">
              <span class="cell-line justify-end" :class="{ 'text-disabled': line.produced === null }">
                {{ line.produced === null ? '—' : `${formatNumber(line.produced)}/min` }}
              </span>
            </td>
            <td>
              <span v-if="!line.imports.length" class="cell-line text-disabled">&mdash;</span>
              <span
                v-for="imported in line.imports"
                :key="imported.fromFactoryId"
                class="cell-line ga-2 text-no-wrap"
              >
                <v-chip class="sf-chip factory x-small no-margin">
                  <i class="fas fa-industry mr-1" />{{ imported.fromFactoryName }}
                </v-chip>
                <span class="text-medium-emphasis">{{ formatNumber(imported.amount) }}/min</span>
                <v-chip
                  v-if="imported.change"
                  class="sf-chip x-small no-margin"
                  :class="changeClass(imported.change)"
                >
                  {{ importChangeLabels[imported.change] }}
                </v-chip>
              </span>
            </td>
            <td>
              <span v-if="!line.exports.length" class="cell-line text-disabled">Used internally</span>
              <span
                v-for="exported in line.exports"
                :key="exported.toFactoryId"
                class="cell-line ga-2 text-no-wrap"
              >
                <v-chip class="sf-chip factory x-small no-margin">
                  <i class="fas fa-industry mr-1" />{{ exported.toFactoryName }}
                </v-chip>
                <span class="text-medium-emphasis">{{ formatNumber(exported.amount) }}/min</span>
              </span>
            </td>
          </tr>
        </tbody>
      </v-table>

      <v-alert class="mt-4" density="comfortable" type="warning" variant="tonal">
        <div class="d-flex align-center flex-wrap ga-3">
          <span class="flex-grow-1">
            There is no undo. Download your plan as it stands first if you want a way to
            restore this: copy the contents of the file to your clipboard, then press
            <b>Paste plan</b> on the planner.
          </span>
          <v-btn
            id="wizard-backup"
            :color="backedUp ? 'grey' : 'warning'"
            :prepend-icon="backedUp ? 'fas fa-check' : 'fas fa-download'"
            variant="flat"
            @click="downloadBackup"
          >
            {{ backedUp ? 'Downloaded' : 'Download a backup' }}
          </v-btn>
        </div>
      </v-alert>
    </template>
    <template #actions>
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
        <!-- The default loader hides its label, and this is the one button whose wait is long
             enough to need saying out loud. -->
        <template #loader>
          <span class="d-flex align-center ga-2">
            <v-progress-circular indeterminate size="18" width="2" />
            Applying, please wait
          </span>
        </template>
        Apply
      </v-btn>
    </template>
  </app-dialog>
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
    placeNewFactories,
    WizardApplyResult,
    WizardChange,
    WizardChoice,
    WizardFactoryPlan,
    WizardPlacement,
    WizardRow,
  } from '@/utils/factory-management/raw-wizard'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import { downloadPlan } from '@/utils/plan-backup'
  import { usePowerTarget } from '@/composables/usePowerTarget'
  import { PURITY_LABELS } from '@/utils/factory-management/building-groups/extraction'

  const props = defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

  const appStore = useAppStore()
  const gameDataStore = useGameDataStore()
  // Via the composable, not tab.powerTarget. A target set before targets were per-plan lives in
  // localStorage only, and the 0 recorded for it would stick: pasting a backup writes the target
  // back onto the tab (#536). Copy plan reads it the same way, so both produce the same blob.
  const { powerTarget } = usePowerTarget()

  const rows = ref<WizardRow[]>([])
  const pending = ref<WizardApplyResult | null>(null)
  const applying = ref(false)
  const error = ref('')
  const placement = ref<WizardPlacement>('top')

  // Column order, and the header each one wears. Every row shows all four so the columns line up;
  // the ones a row can't use render as a dash.
  const ALL_CHOICES: WizardChoice[] = ['mine', 'onsite', 'import', 'ignore']

  const choiceLabels: Record<WizardChoice, string> = {
    mine: 'New mine factory',
    onsite: 'Produce it locally',
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

  const changeLabels: Record<'new' | 'increased', string> = {
    new: 'New product',
    increased: 'Increased',
  }

  const importChangeLabels: Record<'new' | 'increased', string> = {
    new: 'New import',
    increased: 'Increased',
  }

  const changeClass = (change: 'new' | 'increased') =>
    change === 'new' ? 'green' : 'status-warning-outlined'

  // One line per item the factory ends up with: what it makes, what it brings in, and where each
  // of it goes. Imports are the whole answer for a factory the run only wired up — nothing about
  // its products changes, so without them "Modified" would have nothing to point at.
  const factoryLines = (plan: WizardFactoryPlan) => {
    // "New factory" on the header already said everything below it is new.
    const allNew = plan.isNew && plan.products.every(product => product.change === 'new')

    const partIds: string[] = []
    const seen = new Set<string>()
    const addPart = (partId: string) => {
      if (!seen.has(partId)) {
        seen.add(partId)
        partIds.push(partId)
      }
    }
    plan.products.forEach(product => addPart(product.partId))
    plan.imports.forEach(imported => addPart(imported.partId))
    plan.exports.forEach(exported => addPart(exported.partId))

    return partIds.map(partId => {
      // A factory can make the same part twice (unpackaging it and extracting it, say), so the
      // line sums them and takes the strongest of the two changes.
      const products = plan.products.filter(entry => entry.partId === partId)
      const imports = plan.imports.filter(entry => entry.partId === partId)

      let change: WizardChange = null
      if (products.some(entry => entry.change === 'increased')) {
        change = 'increased'
      }
      if (products.some(entry => entry.change === 'new')) {
        change = 'new'
      }

      // The name goes green for anything new to this factory, however it arrived — a factory the
      // run only wired up gains the item as an import, and that is just as new as a product.
      const isNew = change === 'new' || imports.some(entry => entry.change === 'new')

      return {
        partId,
        partName: products[0]?.partName ??
          imports[0]?.partName ??
          plan.exports.find(entry => entry.partId === partId)!.partName,
        produced: products.length
          ? products.reduce((total, entry) => total + entry.amount, 0)
          : null,
        change: allNew ? null : change,
        isNew: allNew ? false : isNew,
        imports,
        exports: plan.exports.filter(entry => entry.partId === partId),
      }
    })
  }

  // Rebuild from the live plan every time it opens — the table is a snapshot, and a stale one
  // is exactly what the apply-time validation is there to reject.
  watch(() => props.modelValue, open => {
    if (!open) return
    rows.value = collectRawWizardRows(appStore.getFactories())
    pending.value = null
    error.value = ''
    backedUp.value = false
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
        { placement: placement.value },
      )
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      pending.value = null
    }
  }

  // Reordering the built result rather than applying the wizard again: a re-run would rebuild the
  // mines from scratch and lose anything renamed on this screen.
  watch(placement, () => {
    if (!pending.value) return
    const newIds = new Set(pending.value.summary.factories.filter(plan => plan.isNew).map(plan => plan.factoryId))
    pending.value.factories = placeNewFactories(pending.value.factories, newIds, placement.value)

    // The table below claims to be in plan order, so it moves with them.
    const order = new Map(pending.value.factories.map((factory, index) => [factory.id, index]))
    pending.value.summary.factories.sort((a, b) =>
      (order.get(a.factoryId) ?? 0) - (order.get(b.factoryId) ?? 0))
  })

  // The plan exactly as it stands, in the shape "Paste plan" reads — the only way back, since
  // applying can't be undone.
  const backedUp = ref(false)
  const downloadBackup = () => {
    const tab = appStore.getCurrentTab()
    downloadPlan({
      name: tab?.name,
      factories: appStore.getFactories(),
      powerTarget: powerTarget.value,
      // Backed up as it stands, unanswered included: restoring it must put back the plan that
      // was there, warning and all.
      plannerVersion: tab?.plannerVersion,
      // The only group state the factories don't carry themselves.
      groups: tab?.groups,
      // The Depot research the plan was written against. Absent reads as fully researched, so a
      // backup without these restores at 16x the upload speed the plan was sized for.
      depotUploadTier: tab?.depotUploadTier,
      depotExpansionTier: tab?.depotExpansionTier,
    })
    backedUp.value = true
    eventBus.emit('toast', { message: 'Plan downloaded. To restore it, copy the file\'s contents and press Paste plan.' })
  }

  const editingId = ref<number | null>(null)
  const editingName = ref('')

  const startRename = (plan: WizardFactoryPlan) => {
    editingId.value = plan.factoryId
    editingName.value = plan.factoryName
  }

  // The name has to land on the factory that gets committed AND on every chip naming it, since
  // the review's imports and exports carry their own copy of it.
  const commitRename = (factoryId: number) => {
    if (editingId.value !== factoryId || !pending.value) return
    editingId.value = null

    const name = editingName.value.trim()
    const factory = pending.value.factories.find(entry => entry.id === factoryId)
    if (!name || !factory || name === factory.name) return

    const previous = factory.name
    factory.name = name
    pending.value.summary.minesCreated = pending.value.summary.minesCreated
      .map(mine => mine === previous ? name : mine)

    for (const plan of pending.value.summary.factories) {
      if (plan.factoryId === factoryId) plan.factoryName = name
      plan.imports.forEach(imported => {
        if (imported.fromFactoryId === factoryId) imported.fromFactoryName = name
      })
      plan.exports.forEach(exported => {
        if (exported.toFactoryId === factoryId) exported.toFactoryName = name
      })
    }
  }

  // Commits on a plan this size block the main thread for seconds. Vue writing the button's
  // loading state is not the same as the browser having drawn it, so wait for a frame to actually
  // land first — one rAF fires before the paint, the second after it. Without this the button
  // never visibly changes and the whole dialog simply freezes.
  const afterPaint = async () => {
    await nextTick()
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  }

  const apply = async () => {
    if (applying.value || !pending.value) return
    applying.value = true
    await afterPaint()

    try {
      appStore.setFactories(pending.value.factories)
      // The plan has now been answered for, whichever door the wizard was opened through —
      // running it from Options never went past the notice that would otherwise stamp it.
      appStore.dismissRawBreakingNotice()
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

  .wizard-table:not(.review-table) .factory-group + .factory-group .factory-row td {
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

  .placement {
    background: rgba(255, 255, 255, 0.05);
  }

  .rename-field {
    max-width: 320px;
  }

  // A factory exporting to six others makes a tall cell; the item and its rate belong beside the
  // first line of it, not floating in the middle.
  .review-table tbody td {
    vertical-align: top;
    padding-top: 8px !important;
    padding-bottom: 8px !important;
  }

  // One line height for every column. Chips, item icons and plain rates are all different
  // heights, so without this each column starts at its own baseline and nothing lines up.
  .review-table .cell-line {
    align-items: center;
    display: flex;
    min-height: 34px;
  }

  // Each factory is a block, not a run of rows: the heading carries the chip's own colour taken
  // right down, and an accent stripe down the side ties its rows to it. A plan of thirty
  // factories then reads as created-vs-changed without reading a word of it.
  .factory-group--new {
    --group-accent: var(--sf-success);
  }

  // The same amber the planner uses for a factory that needs looking at, not the caution yellow.
  .factory-group--modified {
    --group-accent: var(--sf-status-warning);
  }

  // Derived from the accent so the two headings always sit in the same relationship. Translucent
  // is safe here where an opaque fill would be elsewhere — one surface sits behind this table.
  .review-table .factory-row td {
    background: color-mix(in srgb, var(--group-accent) 18%, transparent);
  }

  // An inset shadow rather than a border: the gap above each heading is a transparent top
  // border, and a real border-left paints through it — leaving a stray stub of colour floating
  // in the space between two factories. Inset shadows stop at the padding edge.
  .review-table .factory-group td:first-child {
    box-shadow: inset 4px 0 0 var(--group-accent);
  }

  // The name alone, not the whole row: a green band per added product turned the table into
  // stripes and competed with the factory heading it sits under.
  .item-name--new {
    color: var(--sf-success);
    font-weight: 700;
  }

  // A coloured heading butted against the previous factory's last row reads as part of it, and a
  // hairline is lost against the fill. `padding-box` is what makes the transparent border a gap
  // rather than more of the heading's own colour.
  .review-table .factory-group + .factory-group .factory-row td {
    background-clip: padding-box;
    border-top: 28px solid transparent;
  }
</style>
