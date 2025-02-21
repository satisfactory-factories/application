<template>
  <v-row>
    <v-col>
      <v-btn
        class="ma-1"
        color="blue"
        :disabled="getFactories().length === 0"
        prepend-icon="fas fa-compress-alt"

        variant="tonal"
        @click="emit('hide-all')"
      >
        Hide all
      </v-btn>
      <v-btn
        class="ma-1"
        color="blue"
        :disabled="getFactories().length === 0"
        prepend-icon="fas fa-expand-alt"

        variant="tonal"
        @click="expandAll"
      >
        Expand all
      </v-btn>
      <v-btn
        class="ma-1"
        color="blue"
        prepend-icon="fas fa-info-circle"
        variant="tonal"
        @click="emit('toggle-help-text')"
      >
        {{ helpTextShown ? "Hide" : "Show" }} Info
      </v-btn>
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
      <v-btn
        class="ma-1"
        color="red"
        :disabled="getFactories().length === 0"
        prepend-icon="fas fa-trash"
        variant="tonal"
        @click="confirmDelete('Are you really sure? This will delete literally everything!') && emit('clear-all')"
      >
        Clear
      </v-btn>
      <v-btn
        class="ma-1"
        color="secondary"
        :disabled="getFactories().length === 0"
        prepend-icon="fas fa-copy"
        variant="tonal"
        @click="copyPlanToClipboard"
      >
        Copy plan
      </v-btn>
      <v-btn
        class="ma-1"
        color="secondary"
        prepend-icon="fas fa-clipboard"
        variant="tonal"
        @click="confirmReplace() && pastePlanFromClipboard()"
      >
        Paste plan
      </v-btn>
      <templates />
      <v-btn
        class="ma-1"
        color="amber"
        :disabled="getFactories().length === 0 || disableRecalc"
        prepend-icon="fas fa-calculator-alt"
        variant="tonal"
        @click="forceRecalc"
      >
        Recalculate
      </v-btn>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { defineEmits, defineProps } from 'vue'
  import { useAppStore } from '@/stores/app-store'
  import { confirmDialog } from '@/utils/helpers'
  import eventBus from '@/utils/eventBus'

  const { getFactories, prepareLoader, forceCalculation } = useAppStore()

  const disableRecalc = ref(false)

  defineProps<{ helpTextShown: boolean }>()
  // eslint-disable-next-line func-call-spacing
  const emit = defineEmits<{
    (event: 'hide-all'): void;
    (event: 'show-all'): void;
    (event: 'toggle-help-text'): void;
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
    const plan = JSON.stringify(getFactories())
    navigator.clipboard.writeText(plan)
    eventBus.emit('toast', { message: 'Plan copied to clipboard! You can save it to a file if you like, or paste it.' })
  }

  const pastePlanFromClipboard = () => {
    navigator.clipboard.readText().then(plan => {
      try {
        const parsedPlan = JSON.parse(plan)
        emit('clear-all')

        setTimeout(() => {
          prepareLoader(parsedPlan)
        }, 250)
      } catch (err) {
        if (err instanceof Error) {
          alert(`Invalid plan. Error: ${err.message}`)
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
