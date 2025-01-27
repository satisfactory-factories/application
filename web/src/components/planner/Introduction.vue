<template>
  <v-dialog v-model="showDialog" max-width="1000" scrollable>
    <v-card class="my-2">
      <v-card-title class="text-center pb-0">
        <h1 class="text-h1">Welcome to Satisfactory Factories!</h1>
      </v-card-title>
      <v-card-subtitle class="text-center">
        <h6 class="text-h6">Bringing sanity to the production chain!</h6>
      </v-card-subtitle>
      <v-card-text class="text-body-1 text-left">
        <v-responsive :aspect-ratio="16 / 9" class="pb-4">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            frameborder="0"
            height="100%"
            referrerpolicy="strict-origin-when-cross-origin"
            src="https://www.youtube.com/embed/cKuWEKwxX5c?si=mEVI0mJoiNbIwzkG"
            title="YouTube video player"
            width="100%"
          />
        </v-responsive>
        <p class="text-h5">Why does this tool exist?</p>
        <p>TL;DR: Create production goals for each factory, create and manage dependencies between factories, visualise the flow of items and highlight bottlenecks / gaps in supply as you scale your industrial prowess!</p>
        <p><b>Satisfactory Factories</b> helps plan and manage modular factory (or levels in mega-factories) production chains. Tracking interconnected factories and their dependencies can be overwhelming, leading to overlooked areas and bottlenecks when demands change. This tool automates calculations, ensuring proper scaling for new demands and saving time. Unlike other planners that focus on "what is needed to make X part", SF focuses on per-factory demand rather than <i>just</i> per-part demand. You can use it to determine part quantities and import requirements for future changes, maintaining the production chain and highlighting issues / bottlenecks.</p>
        <div class="py-2 mb-4 border-t-md border-b-md rounded">
          <p class="text-h5">Enough yapping, how does it work?</p>
          <ul class="ml-4 mb-4">
            <li>Firstly you create a <i class="fas fa-industry mr-2  fa-fw" /><b>Factory</b> (and give it a name!).</li>
            <li><i class="fas fa-conveyor-belt-alt mr-2 fa-fw" /><b>Products</b>: is what the factory is intending to produce (or to produce internally, these will be marked as <v-chip color="green" size="small">internal</v-chip>).</li>
            <li><i class="fas fa-arrow-to-right mr-2 fa-fw" /><b>Imports</b>: is where you are bringing in items needed for production. These use the <i class="fa fa-truck-container mr-2" /><b>Exports</b> of other factories.</li>
            <li><i class="fas fa-check mr-2 fa-fw" /><b>Satisfaction</b>: informs you if you're short of inputs or <v-chip color="green" size="small">internal</v-chip> production to satisfy the factory's production requirements.</li>
            <li><i class="fa fa-truck-container mr-2 fa-fw" /><b>Exports</b>: any items after internal production is factored in, are listed as Exports ready to be shipped to other factories.</li>
          </ul>
          <p class="mb-2">Factories that are:</p>
          <ul class="ml-4 mb-2">
            <li>Unsatisfied (missing imports, not enough internal production) etc</li>
            <li>Not producing enough to meet export demands</li>
          </ul>
          <p>will be marked in <span class="text-red">red</span> on both the main factory view and the list to the left.</p>
          <p>My suggestion would be to start from "Goal first". Define a factory producing end products, then work your way back from there to the very base level products. But you can plan however you like!</p>
        </div>
        <div class="px-2 py-2 mb-4 bg-blue-grey-darken-3 rounded">
          <p>
            Please note - this project is in an <span class="text-orange font-weight-bold">alpha</span> state, it is very hot out of the oven and there may <i>(will)</i> be some bugs. Please report any bugs to the project's <a href="https://github.com/Maelstromeous/satisfactory-factories/issues">GitHub Issues page</a> for now.
          </p>
          <p>Each page has a Todo section with what I plan to add. Please offer any suggestions at the GitHub link above for any improvements you'd like to see.</p>
        </div>
        <p>Happy planning! - Maelstromeous</p>
      </v-card-text>
      <v-card-actions>
        <template v-if="source === 'planner'">
          <v-btn color="blue" @click="close">
            <i class="fas fa-file" /><span class="ml-2">Start with an empty plan</span>
          </v-btn>
          <v-btn color="green" variant="elevated" @click="setupDemo">
            <i class="fas fa-list" /><span class="ml-2">Start with a demo plan</span>
          </v-btn>
        </template>
        <template v-if="source === 'changelog'">
          <v-btn color="green" href="/?setupDemo=true" variant="elevated">
            <i class="fas fa-list" /><span class="ml-2">Open Demo</span>
          </v-btn>
          <v-btn color="blue" variant="elevated" @click="close">
            <i class="fas fa-check" /><span class="ml-2">Close</span>
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
  import eventBus from '@/utils/eventBus'
  import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
  import { useAppStore } from '@/stores/app-store'
  const { getFactories, prepareLoader } = useAppStore()

  defineProps<{ source: 'planner' | 'changelog' }>()

  // Grab from local storage if the user has already dismissed this popup
  // If they have, don't show it again.
  const introShow = ref<boolean>(!localStorage.getItem('dismissed-introduction'))
  const showDialog = ref<boolean>(false)

  // Set up a watcher if the dialogue is changed to closed, we emit the event by calling close()
  watch(() => showDialog.value, value => {
    if (!value) {
      console.log('Closing intro via watch')
      close()
    }
  })

  eventBus.on('introToggle', (show: boolean) => {
    console.log('Introduction: Got introToggle event', show)
    show ? open() : close()
  })

  const open = () => {
    console.log('Introduction: Opening introduction')
    showDialog.value = true
    localStorage.setItem('dismissed-introduction', 'false')
  }
  const close = () => {
    console.log('Introduction: Closing introduction')
    showDialog.value = false
    localStorage.setItem('dismissed-introduction', 'true')
  }

  const setupDemo = () => {
    if (getFactories().length > 0) {
      if (!confirm('Showing the demo will clear the current plan. Are you sure you wish to do this?')) {
        return // User cancelled
      }
    }
    close()
    prepareLoader(complexDemoPlan().getFactories(), true)
  }

  if (introShow.value) {
    open()
  }
</script>
<style lang="scss" scoped>
p {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}
</style>
