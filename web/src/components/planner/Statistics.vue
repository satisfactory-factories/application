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
        <v-card-text v-show="!hidden" class="text-body-1">
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
          <div v-show="!hiddenProducts" max-height="500px">
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

  // Initialize the 'hidden' ref based on the value in localStorage
  const hidden = ref<boolean>(
    localStorage.getItem('statisticsHidden') === 'true'
  )

  // Watch the 'hidden' ref and update localStorage whenever it changes
  watch(hidden, newValue => {
    localStorage.setItem('statisticsHidden', newValue.toString())
  })

  // Function to toggle visibility
  const toggleVisibility = () => {
    hidden.value = !hidden.value
  }
  // Initialize the 'hidden' ref based on the value in localStorage
  const hiddenProducts = ref<boolean>(
    localStorage.getItem('statisticsProductsHidden') === 'true'
  )

  // Watch the 'hidden' ref and update localStorage whenever it changes
  watch(hiddenProducts, newValue => {
    localStorage.setItem('statisticsProductsHidden', newValue.toString())
  })

  // Function to toggle visibility
  const toggleProductsVisibility = () => {
    hiddenProducts.value = !hiddenProducts.value
  }

  </script>
