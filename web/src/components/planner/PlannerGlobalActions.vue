<template>
  <v-row>
    <v-col>
      <!-- Every button here is wrapped rather than carrying a `title`: a native tooltip can't say
           anything useful about a disabled control, and five of these disable themselves on an
           empty plan — exactly when someone is most likely to hover one asking why it won't
           click. <tooltip> puts the v-tooltip on a wrapper span, so the hint still appears, and
           each disabled button explains itself instead of just going grey. -->
      <tooltip :text="isEmpty ? 'Nothing to hide yet — add a factory first.' : 'Collapse every factory down to its header, to see the shape of the whole plan at once.'">
        <v-btn
          class="ma-1"
          color="blue"
          :disabled="isEmpty"
          prepend-icon="fas fa-compress-alt"
          variant="tonal"
          @click="emit('hide-all')"
        >
          Hide all
        </v-btn>
      </tooltip>
      <tooltip :text="isEmpty ? 'Nothing to expand yet — add a factory first.' : 'Open every factory card. Past ten factories this will make the page lag, and you\'ll be warned before it does.'">
        <v-btn
          class="ma-1"
          color="blue"
          :disabled="isEmpty"
          prepend-icon="fas fa-expand-alt"
          variant="tonal"
          @click="expandAll"
        >
          Expand all
        </v-btn>
      </tooltip>
      <!-- Flat while on, tonal while off: the label alone ("Full width" / "Normal width") says
           what the next click does, not what the planner is doing now, and this is the only
           button here that holds a state. -->
      <tooltip :text="options.fullWidth ? 'Put back the margins the planner keeps either side of the plan on a wide screen.' : 'Give the plan the whole window, dropping the margins the planner keeps either side of it on a wide screen. Below 2000px there are none to drop.'">
        <v-btn
          class="ma-1"
          color="blue"
          prepend-icon="fas fa-arrows-alt-h"
          :variant="options.fullWidth ? 'flat' : 'tonal'"
          @click="options.fullWidth = !options.fullWidth"
        >
          {{ options.fullWidth ? "Normal" : "Full" }} width
        </v-btn>
      </tooltip>
      <tooltip text="Replay the introduction: what the planner is, and how a plan is put together.">
        <v-btn
          class="ma-1"
          color="green"
          prepend-icon="fas fa-users-class"
          ripple
          variant="tonal"
          @click="eventBus.emit('introToggle', true)"
        >
          Show Intro
        </v-btn>
      </tooltip>
      <tooltip text="Work in progress: build a plan from a Satisfactory save file.">
        <v-btn
          class="ma-1"
          color="yellow"
          prepend-icon="fas fa-file-import"
          ripple
          variant="tonal"
          @click="emit('import-world')"
        >
          Import world [WIP]
        </v-btn>
      </tooltip>
      <tooltip :text="isEmpty ? 'Nothing to clear yet — the plan is already empty.' : 'Delete every factory in this plan. There is no undo, so copy the plan first if you might want it back.'">
        <v-btn
          class="ma-1"
          color="red"
          data-testid="clear-plan"
          :disabled="isEmpty"
          prepend-icon="fas fa-trash"
          variant="tonal"
          @click="confirmDelete('Are you really sure? This will delete literally everything!') && emit('clear-all')"
        >
          Clear
        </v-btn>
      </tooltip>
      <tooltip :text="isEmpty ? 'Nothing to export yet, add a factory first.' : 'Take the whole plan out of the planner (every factory, plus the tab name, power target and groups) as a file to keep, or as JSON on your clipboard.'">
        <v-btn
          class="ma-1"
          color="secondary"
          data-testid="export-plan"
          :disabled="isEmpty"
          prepend-icon="fas fa-file-export"
          variant="tonal"
          @click="exportOpen = true"
        >
          Export plan
        </v-btn>
      </tooltip>
      <tooltip text="Replace this tab with a plan from a file or from your clipboard. You'll be asked first if this tab already has factories in it, and a cloud plan is replaced on every device it is open on.">
        <v-btn
          class="ma-1"
          color="secondary"
          data-testid="import-plan"
          prepend-icon="fas fa-file-import"
          variant="tonal"
          @click="importOpen = true"
        >
          Import plan
        </v-btn>
      </tooltip>
      <templates />
      <tooltip :text="recalcTooltip">
        <v-btn
          class="ma-1"
          color="amber"
          :disabled="isEmpty || disableRecalc"
          prepend-icon="fas fa-calculator-alt"
          variant="tonal"
          @click="forceRecalc"
        >
          Recalculate
        </v-btn>
      </tooltip>
    </v-col>
  </v-row>

  <export-plan-dialog v-model="exportOpen" @choose="onExportChoice" />
  <import-plan-dialog
    v-model="importOpen"
    :busy="importing"
    :error="importError"
    @clipboard="importFromClipboard"
    @file="importFromFile"
  />
</template>

<script setup lang="ts">
  import ExportPlanDialog from '@/components/planner/ExportPlanDialog.vue'
  import ImportPlanDialog from '@/components/planner/ImportPlanDialog.vue'
  import { recordEvent } from '@/utils/record-event'
  import { useAppStore } from '@/stores/app-store'
  import { usePowerTarget } from '@/composables/usePowerTarget'
  import { usePlannerOptions } from '@/composables/usePlannerOptions'
  import { confirmDialog } from '@/utils/helpers'
  import { downloadPlan, serializePlan } from '@/utils/plan-backup'
  import type { PlanBlob } from '@/utils/plan-backup'
  import { markTabEdited } from '@/utils/sync-intent'
  import eventBus from '@/utils/eventBus'

  const { getFactories, getCurrentTab, getTabState, prepareLoader, forceCalculation } = useAppStore()
  const { powerTarget } = usePowerTarget()
  const options = usePlannerOptions()

  const disableRecalc = ref(false)
  const exportOpen = ref(false)
  const importOpen = ref(false)
  const importError = ref('')
  const importing = ref(false)

  // Named because it is the reason five of these buttons are disabled, and each says so in its
  // own tooltip rather than leaving the reader to guess at a greyed-out control.
  const isEmpty = computed(() => getFactories().length === 0)

  const recalcTooltip = computed(() => {
    if (disableRecalc.value) return 'Recalculating…'
    if (isEmpty.value) return 'Nothing to recalculate yet — add a factory first.'
    return 'Recalculate every factory from scratch. Slow enough on a big plan that the browser will complain, so it asks first — only worth it if a number looks wrong.'
  })

  const emit = defineEmits<{
    (event: 'hide-all'): void;
    (event: 'show-all'): void;
    (event: 'import-world'): void;
    (event: 'clear-all'): void;
  }>()

  const confirmDelete = (message: string): boolean => {
    return confirm(message)
  }

  /**
   * Delete already says who loses what, and a replace destroys the same thing for
   * the same people, so it says the same. "Your plan" was written when every tab
   * was local: on a cloud plan the replacement lands on every device it is open on,
   * and on a shared one it lands on everybody else as well.
   */
  const replaceWarning = (): string => {
    const tab = getCurrentTab()
    const state = getTabState(tab?.id ?? '')
    const name = tab?.name ?? 'this plan'

    if (state.kind === 'local') return 'This will replace your plan. Are you sure?'
    if (state.kind === 'synced' && state.role === 'owner') {
      return state.shared
        ? `This will replace "${name}" for everyone you have shared it with, on every device. Are you sure?`
        : `This will replace "${name}" on your account, on every device you are signed in on. Are you sure?`
    }
    // A member or a link visitor: theirs is the same copy everybody else is looking at.
    return `This will replace "${name}" for everyone in this plan, including its owner. Are you sure?`
  }

  const confirmReplace = () => {
    // An empty tab has nothing to lose, cloud or not, so it is replaced in silence.
    if (getFactories().length === 0) return true
    return confirmDialog(replaceWarning())
  }

  const expandAll = () => {
    if (getFactories().length > 10) {
      eventBus.emit('toast', { message: 'You are expanding a lot of factories. Expect performance issues.', type: 'warning' })

      setTimeout(() => {
        emit('show-all')
      }, 250)
    } else {
      emit('show-all')
    }
  }

  /**
   * Holistic full-tab copy: the tab name, power target and the entire factories
   * array (which itself carries products, building groups, export calculator
   * settings, tasks, notes, collapse state, sync state, etc). The tab id is
   * intentionally omitted: an import replaces the current tab and keeps its own id.
   * Older exports were a bare Factory[] array, which the import path still accepts.
   */
  const planBlob = (): PlanBlob => ({
    name: getCurrentTab()?.name,
    factories: getFactories(),
    powerTarget: powerTarget.value,
    // Travels with the plan: importing a plan that has already been answered for must not
    // ask again, and importing one from before the change must.
    plannerVersion: getCurrentTab()?.plannerVersion,
    // The only group state the factories don't carry themselves.
    groups: getCurrentTab()?.groups,
    // Describes the save the plan is written against, not the browser, so it travels with the
    // plan. Absent means fully researched, so dropping these would rewrite the plan's capacity.
    depotUploadTier: getCurrentTab()?.depotUploadTier,
    depotExpansionTier: getCurrentTab()?.depotExpansionTier,
  })

  const onExportChoice = async (choice: 'file' | 'clipboard') => {
    exportOpen.value = false
    if (choice === 'file') {
      downloadPlan(planBlob())
      eventBus.emit('toast', { message: 'Plan saved as a file. Import it back from any tab, on any device.', type: 'success' })
      return
    }
    await navigator.clipboard.writeText(serializePlan(planBlob()))
    eventBus.emit('toast', { message: 'Plan copied to clipboard! You can save it to a file if you like, or import it into another tab.' })
  }

  // Only what the pasted blob actually states. The three tab settings are optional and the
  // diff has no way to express clearing one, so declaring an absent value would leave intent
  // that no op could ever satisfy.
  const declarePastedTabFields = (parsedPlan: PlanBlob) => {
    markTabEdited('groups')
    if (parsedPlan.plannerVersion !== undefined) markTabEdited('plannerVersion')
    if (parsedPlan.depotUploadTier !== undefined) markTabEdited('depotUploadTier')
    if (parsedPlan.depotExpansionTier !== undefined) markTabEdited('depotExpansionTier')
  }

  /**
   * The one path a plan comes back in by, whatever carried it here. Reports rather
   * than alerts: an import that fails belongs in the dialog it failed in, where the
   * other way in is still one click away.
   */
  const applyPlanBlob = (plan: string): true | string => {
    try {
      const parsedPlan = JSON.parse(plan)
      // Legacy blobs are a bare Factory[] array; new ones are a full tab
      // { name, factories, powerTarget }.
      const isLegacy = Array.isArray(parsedPlan)
      const factoriesToLoad = isLegacy ? parsedPlan : parsedPlan.factories
      if (!Array.isArray(factoriesToLoad)) {
        throw new Error('Plan does not contain a factories array.')
      }
      if (isLegacy) {
        const tab = getCurrentTab()
        if (tab) {
          delete tab.plannerVersion
          // A blob from before groups existed has none, so anything here belongs to the plan
          // being replaced.
          delete tab.groups
          // Same for the Depot tiers: a bare-array blob predates them entirely.
          delete tab.depotUploadTier
          delete tab.depotExpansionTier
        }
      }

      emit('clear-all')
      // Announced as it is dropped in, before the load that draws it: this knows a
      // plan arrived and in which tab, and that is all it knows. Whoever cares
      // waits for the load themselves. The rooms store offers a local tab to the
      // cloud once it has drawn, which nothing else would.
      const destination = getCurrentTab()
      if (destination) eventBus.emit('planLanded', destination.id)

      setTimeout(() => {
        // Replace the current tab's settings with the pasted plan's (keeps its id) before
        // loading, so the plan is calculated against its own settings rather than the
        // outgoing tab's.
        if (!isLegacy) {
          powerTarget.value = Number(parsedPlan.powerTarget) || 0
          const tab = getCurrentTab()
          if (tab && parsedPlan.name) {
            tab.name = parsedPlan.name
          }
          if (tab) {
            tab.plannerVersion = parsedPlan.plannerVersion
            // Assigned rather than merged, and assigned even when the blob has none: clearing
            // the factories cannot take memberless groups with it, so anything left here
            // belongs to the plan being replaced.
            tab.groups = parsedPlan.groups
            // Assigned unconditionally for the same reason. A blob written before these
            // existed means "not stated", which reads as fully researched — inheriting the
            // outgoing tab's tiers instead would silently size the pasted plan against
            // somebody else's save.
            tab.depotUploadTier = parsedPlan.depotUploadTier
            tab.depotExpansionTier = parsedPlan.depotExpansionTier
            // Declared for whatever the blob actually stated. An absent value is not
            // declarable — the diff cannot carry "cleared" — so a blob that states none
            // leaves the room's own settings alone rather than silently clearing them.
            declarePastedTabFields(parsedPlan)
          }
        }
        prepareLoader(factoriesToLoad)
      }, 250)
      return true
    } catch (error) {
      recordEvent('plan_import_invalid')
      return error instanceof Error
        ? `That does not look like a plan the planner wrote. ${error.message}`
        : 'That does not look like a plan the planner wrote.'
    }
  }

  const runImport = async (read: () => Promise<string>, whenRefused: string) => {
    if (!confirmReplace()) return

    importing.value = true
    importError.value = ''
    let text: string
    try {
      text = await read()
    } catch {
      importing.value = false
      importError.value = whenRefused
      return
    }
    importing.value = false

    const result = applyPlanBlob(text)
    if (result !== true) {
      importError.value = result
      return
    }
    importOpen.value = false
  }

  /**
   * Reading the clipboard is a permission, and some browsers ask for it with a prompt
   * of their own. Firefox puts a Paste button by the pointer. Dismissed or refused,
   * the read rejects here, and saying so beats the silence this used to give.
   */
  const importFromClipboard = () => runImport(
    () => navigator.clipboard.readText(),
    'Your browser would not let the planner read the clipboard. Some browsers ask you to confirm with a Paste button of their own. Look near the pointer or the address bar, or import from a file instead.',
  )

  const importFromFile = (file: File) => runImport(
    () => file.text(),
    'That file could not be read. Try it again, or copy the plan to your clipboard instead.',
  )

  const forceRecalc = async () => {
    const confirmed = confirmDialog('WARNING: Forcing a recalculation takes a LONG time for large plans. Your browser will lag and will likely complain about stalling. Are you sure?')

    if (!confirmed) return

    eventBus.emit('toast', { message: 'Forcing recalculation of all factories. This may take a while for large plans. Expect lag.', type: 'warning' })
    eventBus.emit('plannerShow', false)
    disableRecalc.value = true

    // Wait for planner to comply
    await new Promise(resolve => setTimeout(resolve, 250))
    forceCalculation()

    console.log('Calculations completed, telling planner to show')
    eventBus.emit('plannerShow', true)
    eventBus.emit('toast', { message: 'Recalculations completed.', type: 'success' })
  }

  eventBus.on('calculationsCompleted', () => {
    disableRecalc.value = false
  })
</script>

<style lang="scss" scoped>
v-list-item {
  margin-bottom: 10px;
  :last-child {
    margin-bottom: 0;
  }
}
</style>
