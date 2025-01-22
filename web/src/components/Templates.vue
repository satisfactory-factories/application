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
                <td class="py-1">{{ template.description }}</td>
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
  import { create315Scenario } from '@/utils/factory-setups/315-non-exportable-parts-imports'
  import { create317Scenario } from '@/utils/factory-setups/317-malformed-plan'
  import { createMaelsBigBoiPlan } from '@/utils/factory-setups/maels-big-boi-plan'
  import { create324Scenario } from '@/utils/factory-setups/324-redundant-import'
  import { create242Scenario } from '@/utils/factory-setups/242-inputs-byproducts'
  import { create321Scenario } from '@/utils/factory-setups/321-product-byproduct-trimming'
  import { create251Scenario } from '@/utils/factory-setups/251-multiple-imports'
  import { create220Scenario } from '@/utils/factory-setups/220-byproduct-only-part'
  import { create338Scenario } from '@/utils/factory-setups/338-satisfaction-chips'
  import { create341Scenario } from '@/utils/factory-setups/341-fissible-uranium-issues'

  const { prepareLoader, isDebugMode } = useAppStore()

  const dialog = ref(false)

  interface Template {
    name: string
    description: string
    data: string
    show: boolean
    isDebug: boolean
  }

  const templates = [
    {
      name: 'Demo',
      description: 'Contains 7 factories with a mix of fluids, solids and multiple dependencies, along with power generation. Has a purposeful bottleneck on Copper Basics to demonstrate the bottleneck feature, and multiple missing resources for the Uranium Power.',
      data: JSON.stringify(complexDemoPlan().getFactories()),
      show: true,
      isDebug: false,
    },
    {
      name: 'Simple',
      description: 'Very simple Iron Ingot and Iron Plate factory setup, with a single dependency link.',
      data: JSON.stringify(createSimple().getFactories()),
      show: true,
      isDebug: false,
    },
    {
      name: 'Mael\'s "MegaPlan"',
      description: 'A real-life plan created by Maelstrome. This is considered a very large plan, and makes use of all features of the planner.',
      data: JSON.stringify(createMaelsBigBoiPlan()),
      show: true,
      isDebug: false,
    },
    {
      name: 'PowerOnlyImport',
      description: '2 factory setup where on factory is producing the a fuel and another is consuming the fuel (via import) for power generation. Related to issue #268',
      data: JSON.stringify(create268Scenraio().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#290 Multiple product imports',
      description: '3 factory setup where one factory is importing the same product from two different factories. Related to issue #290. The Imports on Iron Plates should render correctly with the correct part name, and NOT be called "IronPlate", rather "Iron Plate".',
      data: JSON.stringify(create290Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#315 Import exportable parts',
      description: '#315 - For testing import candidate code. Aluminium factory in this example should not be able to import Copper Ingots from Copper Parts',
      data: JSON.stringify(create315Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: 'Invalid migration',
      description: 'Contains a factory plan that has lots of invalid data. This was a real plan that broke the app, and was used to fix the migration code. It is expected that when you load the template, the plan operates effectively. Originally, supply for certain factories e.g. Gun Powder was broken due to missing part data (due to errors).',
      data: JSON.stringify(create317Scenario()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#324: Redundant Imports',
      description: 'Contains a factory plan where there is a redundant import (on Iron Plates Fac). The UI should show this properly as a warning.',
      data: JSON.stringify(create324Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#242: Byproduct Imports miscalculations',
      description: 'Contains a factory that also contains an import as a byproduct of the same factory. When you hit TRIM on the Dark Matter import in Issue Factory, it should trim the import to 5, as 25 of DMR is produced locally.',
      data: JSON.stringify(create242Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#321: Product byproduct balancing',
      description: 'Contains a factory that produces a byproduct, and then consumes that byproduct. Trimming the products should correctly take other byproducts and products into account. Target to hit is HOR at 120/min. Trimming HOR product itself should result in 40. Setting Rubber to then use 280 resin should create an equilibrium.',
      data: JSON.stringify(create321Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#251: Multiple inputs scenario',
      description: 'Contains a fuel factory that has two imports of compacted coal. The test is to trim import from Factory B, which should result in 260.',
      data: JSON.stringify(create251Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#220: Byproduct only parts handling',
      description: 'Contains a factory that contains a byproduct only part. The planner used to show "Fix Production" for it, but it did nothing as it does not know how to correct the issue. Now, it shows a "Correct Manually" "button" which instructs the user to correct it manually.',
      data: JSON.stringify(create220Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#338: Satisfaction Chips',
      description: 'Contains an oil factory configured with a variety of parts in different states.',
      data: JSON.stringify(create338Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#314: Byproduct / Requirements <=0 breakage',
      description: 'Setting the requirement ingredients of the product to 0 used to break the UI.',
      data: JSON.stringify(create341Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
  ]

  const loadTemplate = (template: Template) => {
    console.log('Template loaded:', template.name, 'starting load')

    // This is a workaround for the templating bug where the data was passed as a reference, and would refuse to load the same template until the page is refreshed.
    const data = JSON.parse(template.data) as Factory[]
    prepareLoader(data, true)
    dialog.value = false
  }
</script>
