<template>
  <!-- Wrapped like the buttons it sits among in the sidebar's global actions, so the row's
       hints all arrive the same way. -->
  <tooltip text="Load one of the example plans — a small starter, the full demo, or Mael's MegaPlan. Overwrites the current plan without asking.">
    <v-btn
      class="ma-1"
      prepend-icon="fas fa-files-medical"
      @click="dialog = true"
    >Templates</v-btn>
  </tooltip>
  <app-dialog
    v-model="dialog"
    icon="fas fa-files-medical"
    max-width="1200"
    scrollable
    title="Load a template plan"
  >
    <p class="mb-3">
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
        <template v-for="template in sortedTemplates" :key="template.name">
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
  </app-dialog>
</template>
<script lang="ts" setup>
  import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
  import { createSimple } from '@/utils/factory-setups/simple-plan'
  import { create503PreMiningPlan } from '@/utils/factory-setups/503-pre-mining-plan'
  import { createMiningDemoPlan } from '@/utils/factory-setups/mining-demo-plan'
  import { create268Scenraio } from '@/utils/factory-setups/268-power-gen-only-import'
  import { createFuelSupplyMatchingScenario } from '@/utils/factory-setups/fuel-supply-matching'
  import { useAppStore } from '@/stores/app-store'
  import { config } from '@/config/config'
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
  import { create267Scenario } from '@/utils/factory-setups/267-nuclear-waste-handling'
  import { create375Scenario } from '@/utils/factory-setups/375-byproduct-ghost-surplus'
  import { create485DemoPlan } from '@/utils/factory-setups/485-drifted-plan'
  import { TemplatePlan } from '@/utils/factory-setups/template-plan'

  const { prepareLoader, isDebugMode, getCurrentTab, rearmRawBreakingNotice } = useAppStore()

  const dialog = ref(false)

  interface Template {
    name: string
    description: string
    // JSON TemplatePayload — always serialize via planData()/scenarioData().
    data: string
    show: boolean
    isDebug: boolean
    // Re-arms the one-time raw-resources breaking-change notice, which is otherwise
    // unreachable once dismissed.
    rearmNotice?: boolean
  }

  interface TemplatePayload {
    factories: Factory[]
    powerTarget: number
  }

  // Real template plans carry their own power target; debug issue scenarios are bare
  // factory arrays and load with no target.
  const planData = (plan: TemplatePlan) =>
    JSON.stringify({ factories: plan.getFactories(), powerTarget: plan.powerTarget } satisfies TemplatePayload)
  const scenarioData = (factories: Factory[]) =>
    JSON.stringify({ factories, powerTarget: 0 } satisfies TemplatePayload)

  const templates: Template[] = [
    {
      name: 'Demo',
      description: 'Contains 12 factories with a mix of fluids, solids and multiple dependencies, along with power generation and all three ways of mining: a dedicated Copper Mine feeding the ingots, a Raw Materials Mine hosting two resources for the nuclear chain, and Oil Processing and Uranium Power extracting their own crude and water on site. Has a purposeful bottleneck on Copper Basics to demonstrate the bottleneck feature, and missing Stators, High-Speed Connectors and Encased Beams for the Uranium Power.',
      data: planData(complexDemoPlan()),
      show: true,
      isDebug: false,
    },
    {
      name: 'Mining',
      description: 'Shows the extraction features end to end: an Iron Mine mixing Mk.3 miners on pure nodes with a Mk.2 on a normal one, a Nitrogen resource well with its satellite spread, and a Nitric Acid factory extracting its own water on site.',
      data: planData(createMiningDemoPlan()),
      show: true,
      isDebug: false,
    },
    {
      name: 'Simple',
      description: 'Very simple Iron Ingot and Iron Plate factory setup, with a single dependency link.',
      data: planData(createSimple()),
      show: true,
      isDebug: false,
    },
    {
      name: 'Mael\'s "MegaPlan"',
      description: 'A real-life plan created by Maelstrome. 36 factories sorted into seven groups, from the raw mines through to the Phase 5 parts, powered by nuclear, plutonium, rocket fuel, geothermal and Alien Power Augmenters. This is considered a very large plan, and makes use of all features of the planner.',
      data: planData(createMaelsBigBoiPlan()),
      show: true,
      isDebug: false,
    },
    {
      name: '#503: Pre-mining plan (migration modal)',
      description: 'A plan built the way plans were before mining existed: seven factories short of seven raw resources, with iron short in two places so the wizard has a shared mine to build. Loading it re-opens the one-time breaking-change notice, which is otherwise unreachable once dismissed. Related to issue #503.',
      data: scenarioData(create503PreMiningPlan().getFactories()),
      show: isDebugMode,
      isDebug: true,
      rearmNotice: true,
    },
    {
      name: 'Generator fuel draw',
      description: 'The Oil MegaFac\'s fuel problem, shrunk to two self-contained factories. Each makes 640/min Liquid Fuel from its own crude, and Recycled Plastic takes 240 of it, so 400 is what the generators may burn. They differ only in what the generators are set to: "over-drawing" is on 640 and should offer Trim to supply (400), taking it 8,000 → 5,000 MW; "spare fuel" is on 240 and should offer Expand to supply (400), taking it 3,000 → 5,000 MW. Nothing is imported and every part but the Plastic the factory exists to make balances exactly, so the fuel is the only thing either has left to settle. The over-drawing one also offers Satisfy (880) on its Liquid Fuel product — deliberately: making more fuel and burning less are both real answers to the same shortage, and the two buttons are the two ends of it.',
      data: scenarioData(createFuelSupplyMatchingScenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: 'PowerOnlyImport',
      description: '2 factory setup where on factory is producing the a fuel and another is consuming the fuel (via import) for power generation. Related to issue #268',
      data: scenarioData(create268Scenraio().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#290 Multiple product imports',
      description: '3 factory setup where one factory is importing the same product from two different factories. Related to issue #290. The Imports on Iron Plates should render correctly with the correct part name, and NOT be called "IronPlate", rather "Iron Plate".',
      data: scenarioData(create290Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#315 Import exportable parts',
      description: '#315 - For testing import candidate code. Aluminium factory in this example should not be able to import Copper Ingots from Copper Parts',
      data: scenarioData(create315Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: 'Invalid migration',
      description: 'Contains a factory plan that has lots of invalid data. This was a real plan that broke the app, and was used to fix the migration code. It is expected that when you load the template, the plan operates effectively. Originally, supply for certain factories e.g. Gun Powder was broken due to missing part data (due to errors).',
      data: scenarioData(create317Scenario()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#324: Redundant Imports',
      description: 'Contains a factory plan where there is a redundant import (on Iron Plates Fac). The UI should show this properly as a warning.',
      data: scenarioData(create324Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#242: Byproduct Imports miscalculations',
      description: 'Contains a factory that also contains an import as a byproduct of the same factory. When you hit TRIM on the Dark Matter import in Issue Factory, it should trim the import to 5, as 25 of DMR is produced locally.',
      data: scenarioData(create242Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#321: Product byproduct balancing',
      description: 'Contains a factory that produces a byproduct, and then consumes that byproduct. Trimming the products should correctly take other byproducts and products into account. Target to hit is HOR at 120/min. Trimming HOR product itself should result in 40. Setting Rubber to then use 280 resin should create an equilibrium.',
      data: scenarioData(create321Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#251: Multiple inputs scenario',
      description: 'Contains a fuel factory that has two imports of compacted coal. The test is to trim import from Factory B, which should result in 260.',
      data: scenarioData(create251Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#220: Byproduct only parts handling',
      description: 'Contains a factory that contains a byproduct only part. The planner used to show "Fix Production" for it, but it did nothing as it does not know how to correct the issue. Now, it shows a "Correct Manually" "button" which instructs the user to correct it manually.',
      data: scenarioData(create220Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#338: Satisfaction Chips',
      description: 'Contains an oil factory configured with a variety of parts in different states.',
      data: scenarioData(create338Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#314: Byproduct / Requirements <=0 breakage',
      description: 'Setting the requirement ingredients of the product to 0 used to break the UI.',
      data: scenarioData(create341Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#267: Nuclear Waste handling',
      description: 'Nuclear waste was possible to be added via a +Product button in Satisfaction. Now it should show +Generator to add a generator directly instead.',
      data: scenarioData(create267Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#485 + #499: Rounding & broken chain repair',
      description: 'A plan damaged in both of the ways a saved plan can be, to exercise the "Plan data repaired" dialog. It should open on load listing BOTH kinds of correction, grouped by factory. Micro-rounding: quantities a hair off the numbers they mean, left on whole numbers afterwards — the Refinery on 14,400 Rocket Fuel/min, FG TEST on 2,400 plus 3,000 Compacted Coal, the Mega Plant on 12,000 (its 0.01 and the Refinery\'s 0.012 are past the flat snap tolerance, so they prove the scaling one). Broken chain: the Refinery copy inherits the original\'s exports and should be reported as exporting to two factories that are not importing from it (its own quantities drift too, so that factory\'s heading carries both kinds at once); the Refinery\'s export to FG TEST reads 3,200 against an import of 2,400; the Mega Plant\'s import has no matching export; an export entry points at a factory that no longer exists; and Spare Ingots A and B share an internal ID, so one is reassigned. Afterwards no factory should list an export nobody imports.',
      data: scenarioData(create485DemoPlan().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
    {
      name: '#375: Byproduct products handling',
      description: 'Contains a factory that has selected a byproduct as a product. In the issue, a ghost surplus was created as it was counting both the product quantity of 100, and the byproduct quantity of 100. The UI should show Rubber as the main recipe, and HOR as the byproduct.',
      data: scenarioData(create375Scenario().getFactories()),
      show: isDebugMode,
      isDebug: true,
    },
  ]

  // Listed as: the real plans first, then the unnumbered debug scenarios, then the issue
  // ones in issue order. Declaration order decides the rest, so related entries stay together.
  const issueNumber = (name: string) => Number(/#(\d+)/.exec(name)?.[1] ?? NaN)

  const sortedTemplates = computed(() => {
    const rank = (template: Template) => {
      if (!template.isDebug) return 0
      return Number.isNaN(issueNumber(template.name)) ? 1 : 2
    }

    return [...templates]
      .map((template, index) => ({ template, index }))
      .sort((a, b) =>
        rank(a.template) - rank(b.template) ||
        // Only the issue group has a meaningful order of its own.
        (rank(a.template) === 2
          ? issueNumber(a.template.name) - issueNumber(b.template.name)
          : 0) ||
        a.index - b.index)
      .map(entry => entry.template)
  })

  const loadTemplate = (template: Template) => {
    console.log('Template loaded:', template.name, 'starting load')

    // This is a workaround for the templating bug where the data was passed as a reference, and would refuse to load the same template until the page is refreshed.
    const { factories, powerTarget } = JSON.parse(template.data) as TemplatePayload

    // The power target lives on the tab, not in the factories, so apply the plan's
    // own target on load — otherwise the previous plan's target would survive.
    // Explicitly a number (0 = no target, never undefined) — an unset tab value
    // falls back to the legacy localStorage target in usePowerTarget.
    const tab = getCurrentTab()
    if (tab) {
      tab.powerTarget = powerTarget ?? 0
      // Templates are built by today's code, so they have never assumed a raw resource and are
      // answered by construction. The exception is the one that exists to reproduce a plan from
      // before the change: it must arrive unanswered or it cannot reproduce anything.
      tab.plannerVersion = template.rearmNotice ? undefined : config.plannerVersion
    }

    if (template.rearmNotice) {
      rearmRawBreakingNotice()
    }

    prepareLoader(factories, true)
    dialog.value = false
  }
</script>
