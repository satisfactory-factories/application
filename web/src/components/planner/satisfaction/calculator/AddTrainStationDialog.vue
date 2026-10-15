<!-- Adds a station to a factory: a name and how many platforms it has, with the count and belt
     mark suggested from the rate it has to carry. -->
<template>
  <app-dialog v-model="isOpen" icon="fas fa-train" max-width="440" :title="`Add station at ${factory.name}`">
    <v-text-field
      v-model="name"
      autofocus
      class="mb-3"
      density="compact"
      hide-details
      label="Name"
      variant="outlined"
    />
    <v-select
      v-model="platforms"
      density="compact"
      hide-details
      :items="platformCounts"
      label="Platforms"
      variant="outlined"
    />
    <p v-if="amount > 0" class="text-caption text-medium-emphasis mt-2">
      Suggested from {{ formatNumber(amount, 0) }}/min: {{ suggestion.platforms }} platforms on Mk.{{ suggestion.beltMark }} belts.
    </p>
    <template #actions>
      <v-btn variant="text" @click="isOpen = false">Cancel</v-btn>
      <v-btn color="primary" variant="flat" @click="confirm">Add</v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { Factory, TrainStation } from '@/interfaces/planner/FactoryInterface'
  import { addTrainStation, suggestStationLayout } from '@/utils/factory-management/train-logistics'
  import { formatNumber } from '@/utils/numberFormatter'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    factory: Factory
    amount: number
  }>()

  const emit = defineEmits<{
    created: [station: TrainStation]
  }>()

  const isOpen = defineModel<boolean>({ required: true })

  const platformCounts = Array.from({ length: 10 }, (_, index) => index + 1)
  const suggestion = computed(() => suggestStationLayout(props.amount))
  const name = ref('')
  const platforms = ref(4)

  watch(isOpen, open => {
    if (!open) return
    name.value = `${props.factory.name} station ${(props.factory.trainStations?.length ?? 0) + 1}`
    platforms.value = Math.min(10, suggestion.value.platforms)
  })

  const confirm = () => {
    const station = addTrainStation(props.factory, {
      name: name.value,
      platforms: platforms.value,
      beltMark: suggestion.value.beltMark,
    })
    markFactoryEdited(props.factory)
    emit('created', station)
    isOpen.value = false
  }
</script>
