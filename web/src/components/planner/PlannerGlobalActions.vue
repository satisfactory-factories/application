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
      <tooltip :text="isEmpty ? 'Nothing to copy yet — add a factory first.' : 'Copy the whole plan to your clipboard: every factory, plus the tab name, power target and groups. Save it to a file, or paste it into another tab.'">
        <v-btn
          class="ma-1"
          color="secondary"
          data-testid="copy-plan"
          :disabled="isEmpty"
          prepend-icon="fas fa-copy"
          variant="tonal"
          @click="copyPlanToClipboard"
        >
          Copy plan
        </v-btn>
      </tooltip>
      <tooltip text="Replace this tab with a plan copied to your clipboard. You'll be asked first if this tab already has factories in it.">
        <v-btn
          class="ma-1"
          color="secondary"
          data-testid="paste-plan"
          prepend-icon="fas fa-clipboard"
          variant="tonal"
          @click="confirmReplace() && pastePlanFromClipboard()"
        >
          Paste plan
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
</template>

<script setup lang="ts">
  import { recordEvent } from '@/utils/record-event'
  import { useAppStore } from '@/stores/app-store'
  import { usePowerTarget } from '@/composables/usePowerTarget'
  import { usePlannerOptions } from '@/composables/usePlannerOptions'
  import { confirmDialog } from '@/utils/helpers'
  import { serializePlan } from '@/utils/plan-backup'
  import type { PlanBlob } from '@/utils/plan-backup'
  import { markTabEdited } from '@/utils/sync-intent'
  import eventBus from '@/utils/eventBus'

  const { getFactories, getCurrentTab, prepareLoader, forceCalculation } = useAppStore()
  const { powerTarget } = usePowerTarget()
  const options = usePlannerOptions()

  const disableRecalc = ref(false)

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

  const confirmReplace = () => {
    if (getFactories().length === 0) return true
    return confirmDialog('This will replace your plan. Are you sure?')
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

  const copyPlanToClipboard = () => {
    // Holistic full-tab copy: the tab name, power target and the entire factories
    // array (which itself carries products, building groups, export calculator
    // settings, tasks, notes, collapse state, sync state, etc). The tab id is
    // intentionally omitted — a paste replaces the current tab and keeps its own id.
    // Older exports were a bare Factory[] array, which paste still accepts.
    const plan = serializePlan({
      name: getCurrentTab()?.name,
      factories: getFactories(),
      powerTarget: powerTarget.value,
      // Travels with the plan: pasting a plan that has already been answered for must not ask
      // again, and pasting one from before the change must.
      plannerVersion: getCurrentTab()?.plannerVersion,
      // The only group state the factories don't carry themselves.
      groups: getCurrentTab()?.groups,
      // Describes the save the plan is written against, not the browser, so it travels with the
      // plan. Absent means fully researched, so dropping these would rewrite the plan's capacity.
      depotUploadTier: getCurrentTab()?.depotUploadTier,
      depotExpansionTier: getCurrentTab()?.depotExpansionTier,
    })
    navigator.clipboard.writeText(plan)
    eventBus.emit('toast', { message: 'Plan copied to clipboard! You can save it to a file if you like, or paste it.' })
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

  const pastePlanFromClipboard = () => {
    navigator.clipboard.readText().then(plan => {
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
        // The plan is about to land in whatever tab is open, and that is announced
        // once the load finishes so whoever cares can act on it — the rooms store
        // offers a local tab to the cloud, which nothing else would.
        announceWhenLoaded = true

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
      } catch (err) {
        if (err instanceof Error) {
          alert(`Invalid plan. Error: ${err.message}`)
          recordEvent('plan_import_invalid')
        }
      }
    })
  }

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

  /**
   * Set by a paste, spent by the load it starts. Waiting for the load to finish means
   * anything raised over the landing — the cloud offer — opens over the plan rather
   * than over the loading overlay, which is persistent and would sit on top of it.
   *
   * `loadingCompleted` rather than `calculationsCompleted`: a small plan that has
   * never been calculated renders straight through without calculating anything, so
   * the calculation event never comes and the pasted plan was never announced.
   */
  let announceWhenLoaded = false

  eventBus.on('loadingCompleted', () => {
    if (!announceWhenLoaded) return
    announceWhenLoaded = false
    const tab = getCurrentTab()
    if (tab) eventBus.emit('planLanded', tab.id)
  })

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
