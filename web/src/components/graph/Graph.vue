<template>
  <div class="notice">
    <h1 class="text-h4 text-center mt-4">Work in progress!</h1>
    <p class="text-center">
      While the graph is mostly functional (in testing, or it may be totally broken in certain circumstances), many features are missing. Expect overlapping lines and nodes out of place.
    </p>
  </div>

  <VueFlow
    :key="nodes.length"
    :edges="edges"
    :nodes="nodes"
    @nodes-initialized="onNodesInitialized"
  >
    <MiniMap />
    <template #node-custom="props">
      <FactoryNode v-bind="props" @node-rendered="onNodeRendered" />
    </template>
  </VueFlow>
</template>

<script setup lang="ts">
  import { onMounted, shallowRef } from 'vue'
  import { Edge, VueFlow } from '@vue-flow/core'
  import { useAppStore } from '@/stores/app-store'
  import FactoryNode from '@/components/graph/FactoryNode.vue'
  import { MiniMap } from '@vue-flow/minimap'
  import { CustomNode, generateEdges, generateNodes } from '@/utils/graphUtils'
  import { DataInterface } from '@/interfaces/DataInterface'
  import { useLayout } from '@/utils/graphLayout'

  const compProps = defineProps<{ gameData: DataInterface | null }>()

  if (compProps.gameData === null) {
    throw new Error('No game data provided to Planner!')
  }

  const appStore = useAppStore()
  const factories = appStore.getFactories()

  // shallowRef: nodes/edges are only ever replaced wholesale, and vue-flow's
  // Node/Edge types are too deep for Vue's UnwrapRef to instantiate (TS2589).
  const nodes = shallowRef<CustomNode[]>([])
  const edges = shallowRef<Edge[]>([])
  let renderedNodeCount = 0 // Count to track rendered nodes

  const { layout } = useLayout()

  // Apply the layout to organize nodes after generation
  function initializeGraph () {
    nodes.value = generateNodes(appStore.getFactories())
    edges.value = generateEdges(appStore.getFactories(), nodes.value)
  }

  // Handle node rendered and nodesInitialized events
  function onNodeRendered () {
    renderedNodeCount++
    if (renderedNodeCount === nodes.value.length) {
      onNodesInitialized()
    }
  }

  function onNodesInitialized () {
    console.log('Nodes initialized')
    // All nodes have rendered, apply Dagre layout
    const updatedNodes = layout(nodes.value, edges.value, 'LR')
    nodes.value = [...updatedNodes]
    console.log('All nodes rendered, updated with Dagre layout:', nodes.value)
  }

  // Apply initial layout after the component mounts
  onMounted(() => {
    initializeGraph()
    console.log('Initial nodes:', nodes.value)
    console.log('Initial edges:', edges.value)
  })

  watch(factories, () => {
    initializeGraph()
  })
</script>

<style>
/* import the necessary styles for Vue Flow to work */
@import '@vue-flow/core/dist/style.css';

/* import the default theme, this is optional but generally recommended */
@import '@vue-flow/core/dist/theme-default.css';

.notice {
  width: 1000px;
  position: absolute;
  top: 12vh;
  left: calc(50% - 500px);
  z-index: 100;
}
</style>
