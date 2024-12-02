<template>
  <v-card class="factory-card sub-card">
    <v-card-title>Notes</v-card-title>
    <v-card-text>
      <v-textarea
        v-model="factory.notes"
        auto-grow
        :counter="charLimit"
        error-messages=""
        placeholder="Add some notes!"
        rows="1"
        :rules="[rules.length]"
      />
      <v-btn v-if="factory.notes.length > 0" class="mt-1" color="primary" @click="factory.notes = ''">Clear Notes</v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { Factory } from '@/interfaces/planner/FactoryInterface'

  const props = defineProps <{
    factory: Factory;
    helpText: boolean;
  }>()

  // Validation rule for the character limit
  const rules = {
    length: () => {
      // Check if the value length exceeds the character limit
      if (props.factory.notes.length >= charLimit) {
        return `Max character length (${charLimit}) reached, condense your notes, pioneer!`
      }
      return true // Validation passes
    },
  }

  const charLimit = 1000
</script>
