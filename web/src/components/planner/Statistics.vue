<template>
  <v-row>
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 flex-grow-1" cols="8">
            <i class="fas fa-list" /><span class="ml-3">Statistics [WIP]</span>
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
        <v-card-text v-if="!hidden" class="text-body-1">
          <statistics-resources :factories="factories" :help-text="helpText" />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <statistics-buildings :factories="factories" :help-text="helpText" />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <statistics-power :factories="factories" :help-text="helpText" />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <statistics-items-difference :factories="factories" :help-text="helpText" />
          <v-col class="text-center pb-0">
            <v-btn
              v-show="!hiddenProducts"
              color="primary"
              prepend-icon="fas fa-eye-slash"
              variant="outlined"
              @click="toggleProductsVisibility"
            >Hide all Products
            </v-btn>
            <v-btn
              v-show="hiddenProducts"
              color="primary"
              prepend-icon="fas fa-eye"
              variant="outlined"
              @click="toggleProductsVisibility"
            >Show all Products
            </v-btn>
          </v-col>

          <!-- Produced Items Area -->
          <div v-if="!hiddenProducts">
            <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
            <statistics-items :factories="factories" :help-text="helpText" />
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'

  defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // Default to not showing the stats on first ever load
  const statisticsHidden = localStorage.getItem('statisticsHidden') ?? 'false'
  const statisticsProductsHidden = localStorage.getItem('statisticsProductsHidden') ?? 'false'

  // Initialize the 'hidden' refs based on the value in localStorage.
  // Compare against the string — Boolean('false') is true, which hid the section for fresh visitors.
  const hidden = ref<boolean>(statisticsHidden === 'true')
  const hiddenProducts = ref<boolean>(statisticsProductsHidden === 'true')

  // Watch the 'hidden' ref and update localStorage whenever it changes
  watch(hidden, newValue => {
    localStorage.setItem('statisticsHidden', newValue.toString())
  })
  watch(hiddenProducts, newValue => {
    localStorage.setItem('statisticsProductsHidden', newValue.toString())
  })

  // Function to toggle visibility
  const toggleVisibility = () => {
    hidden.value = !hidden.value
  }

  // Function to toggle visibility
  const toggleProductsVisibility = () => {
    hiddenProducts.value = !hiddenProducts.value
  }

</script>
