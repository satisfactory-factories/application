<template>
  <v-row>
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 flex-grow-1" cols="8">
            <i class="fas fa-globe" /><span class="ml-3">World Statistics</span>
          </v-col>
          <v-col class="text-right" cols="4">
            <v-btn
              v-show="!hidden"
              color="primary"
              prepend-icon="fas fa-eye-slash"
              variant="outlined"
              @click="toggleVisibility"
            >Hide
            </v-btn>
            <v-btn
              v-show="hidden"
              color="primary"
              prepend-icon="fas fa-eye"
              variant="outlined"
              @click="toggleVisibility"
            >Show
            </v-btn>
          </v-col>
        </v-row>
        <v-card-text v-show="!hidden" class="text-body-1">
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" />Showing all of the world resources remaining after all factory requirements are taken into account. Units are in /min or /m3 depending on the resource. This does not take into any account about Converters as it's very hard to calculate.
          </p>
          <h1 class="text-h5 mb-4">
            <i class="fas fa-warehouse" />
            <span class="ml-3">World Raw Resources</span>
          </h1>
          <v-chip
            v-for="ore in worldRawResources"
            :key="ore.id"
            class="sf-chip blue"
          >
            <game-asset :subject="ore.id" type="item" />
            <span v-if="ore.name !== 'Water'" class="ml-2">{{ ore.name }}: {{ ore.amount }}</span>
            <span v-else class="ml-2">Water: <i class="fas fa-infinity" /></span>
          </v-chip>
        </v-card-text>
        <v-card-text v-show="!hidden" class="text-body-1">
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" />Showing all of the world power consumption and generation.
          </p>
          <h1 class="text-h5 mb-4">
            <i class="fas fa-bolt " />
            <span class="ml-3">World Power Consumption and Generation</span>
          </h1>
          <span class="ml-2"><b>[Coming soon!!]</b></span>
        </v-card-text>

      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { WorldRawResource } from '@/interfaces/planner/FactoryInterface'

  defineProps<{
    worldRawResources: { [key: string]: WorldRawResource };
    helpText: boolean;
  }>()

  // Initialize the 'hidden' ref based on the value in localStorage
  const hidden = ref<boolean>(localStorage.getItem('worldResourcesHidden') === 'true')

  // Watch the 'hidden' ref and update localStorage whenever it changes
  watch(hidden, newValue => {
    localStorage.setItem('worldResourcesHidden', newValue.toString())
  })

  // Function to toggle visibility
  const toggleVisibility = () => {
    hidden.value = !hidden.value
  }
</script>
