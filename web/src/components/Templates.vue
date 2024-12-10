<template>
  <v-btn
    class="ml-1"
    prepend-icon="fas fa-files-medical"
    @click="dialog = true"
  >Templates</v-btn>
  <v-dialog v-model="dialog" max-width="800">
    <v-card>
      <v-card-title class="headline">
        Load a template plan
      </v-card-title>
      <v-card-text>
        <p class="mb-4">
          Clicking on a button below will load a template plan into the planner. <span class="text-red font-weight-bold">This will overwrite any existing plan WITHOUT warning.</span> You may wish to save your plan first by creating a share link.
        </p>
        <v-table>
          <thead>
            <tr>
              <th class="text-body-1 font-weight-bold text-center" scope="row">Name</th>
              <th class="text-body-1 font-weight-bold" scope="row">Description</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="template in templates" :key="template.name">
              <td class="text-center">
                <v-btn
                  class="mr-2"
                  color="green"
                  @click="loadTemplate(template)"
                >
                  {{ template.name }}
                </v-btn></td>
              <td>{{ template.description }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
      <v-card-actions>
        <v-btn color="blue darken-1" variant="elevated" @click="dialog = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog></template>
<script lang="ts" setup>
  import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
  import { createSimple } from '@/utils/factory-setups/simple-plan'
  import { useAppStore } from '@/stores/app-store'
  import { Factory } from '@/interfaces/planner/FactoryInterface'

  const appStore = useAppStore()

  const dialog = ref(false)

  interface Template {
    name: string
    description: string
    data: Factory[]
  }

  const templates = [
    {
      name: 'Demo',
      description: 'Contains 6 factories with a mix of fluids, solids and multiple dependencies, along with power generation. Has a purposeful bottleneck on Copper Basics to demonstrate the bottleneck feature, and multiple missing resources for the Uranium Power.',
      data: complexDemoPlan().getFactories(),
    },
    {
      name: 'Simple',
      description: 'Very simple Iron Ingot and Iron Plate factory setup, with a single dependency link.',
      data: createSimple().getFactories(),
    },
  ]

  const loadTemplate = (template: Template) => {
    appStore.setFactories(template.data, true)
    dialog.value = false
  }
</script>
