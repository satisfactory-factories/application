<template>
  <v-btn
    class="ml-1"
    prepend-icon="fas fa-files-medical"
    @click="dialog = true"
  >Templates</v-btn>
  <v-dialog v-model="dialog" max-width="800">
    <v-card class="pa-2">
      <v-card-title>
        <h4 class="text-h4">Load a template plan</h4>
      </v-card-title>
      <v-card-text class="pa-4 pt-0">
        <p>
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
            <template v-for="template in templates" :key="template.name">
              <tr v-if="template.show">
                <td class="text-center">
                  <v-btn
                    class="mr-2"
                    :color="template.isDebug ? 'secondary' : 'green'"
                    :prepend-icon="template.isDebug ? 'fas fa-bug' : 'fas fa-file'"
                    @click="loadTemplate(template)"
                  >
                    {{ template.name }}
                  </v-btn></td>
                <td>{{ template.description }}</td>
              </tr>
            </template>
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
  import { create268Scenraio } from '@/utils/factory-setups/268-power-gen-only-import'
  import { useAppStore } from '@/stores/app-store'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { create290Scenario } from '@/utils/factory-setups/290-multiple-byproduct-imports'

  const { startLoad, isDebugMode } = useAppStore()

  const dialog = ref(false)

  interface Template {
    name: string
    description: string
    data: Factory[]
    show: boolean
    isDebug: boolean
  }

  const templates = [
    {
      name: 'Demo',
      description: 'Contains 7 factories with a mix of fluids, solids and multiple dependencies, along with power generation. Has a purposeful bottleneck on Copper Basics to demonstrate the bottleneck feature, and multiple missing resources for the Uranium Power.',
      data: complexDemoPlan().getFactories(),
      show: true,
      isDebug: false,
    },
    {
      name: 'Simple',
      description: 'Very simple Iron Ingot and Iron Plate factory setup, with a single dependency link.',
      data: createSimple().getFactories(),
      show: true,
      isDebug: false,
    },
    {
      name: 'PowerOnlyImport',
      description: '2 factory setup where on factory is producing the a fuel and another is consuming the fuel (via import) for power generation. Related to issue #268',
      data: create268Scenraio().getFactories(),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: 'Multi-input',
      description: '3 factory setup where one factory is importing the same product from two different factories. Related to issue #290. The Imports on Iron Plates should render correctly with the correct part name, and NOT be called "IronPlate", rather "Iron Plate".',
      data: create290Scenario().getFactories(),
      show: isDebugMode,
      isDebug: true,
    },
  ]

  const loadTemplate = (template: Template) => {
    dialog.value = false
    startLoad(template.data, true)
  }
</script>
