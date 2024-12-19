<template>
  <v-row>
    <v-col class="last-child-no-margin">
      <v-btn
        class="ma-1"
        color="blue"
        prepend-icon="fas fa-compress-alt"
        variant="tonal"
        @click="emit('hide-all')"
      >
        Hide all
      </v-btn>
      <v-btn
        class="ma-1"
        color="blue"
        prepend-icon="fas fa-expand-alt"
        variant="tonal"
        @click="emit('show-all')"
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
        @click="emit('show-intro')"
      >
        Show Intro
      </v-btn>
      <v-btn
        class="ma-1"
        color="red"
        prepend-icon="fas fa-trash"
        variant="tonal"
        @click="confirmDelete('Are you really sure? This will delete literally everything!') && emit('clear-all')"
      >
        Clear
      </v-btn>
      <templates />

      <v-btn
        class="ma-1 mb-0"
        color="secondary"
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
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { defineEmits, defineProps } from 'vue'
  import { useAppStore } from '@/stores/app-store'
  import eventBus from '@/utils/eventBus'
  import { confirmDialog } from '@/utils/helpers'

  const { getFactories, startLoad } = useAppStore()

  defineProps<{ helpTextShown: boolean }>()
  // eslint-disable-next-line func-call-spacing
  const emit = defineEmits<{
    (event: 'show-intro'): void;
    (event: 'hide-all'): void;
    (event: 'show-all'): void;
    (event: 'toggle-help-text'): void;
    (event: 'clear-all'): void;
  }>()

  const confirmDelete = (message: string): boolean => {
    return confirm(message)
  }

  const confirmReplace = () => {
    if (getFactories().length === 0) return true
    return confirmDialog('This will replace your plan. Are you sure?')
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

        eventBus.emit('showLoading', parsedPlan.length)

        setTimeout(() => {
          startLoad(parsedPlan, true)
        }, 250)
      } catch (err) {
        if (err instanceof Error) {
          alert(`Invalid plan. Error: ${err.message}`)
        }
      }
    })
  }
</script>

<style lang="scss" scoped>
v-list-item {
  margin-bottom: 10px;
  :last-child {
    margin-bottom: 0;
  }
}
</style>
