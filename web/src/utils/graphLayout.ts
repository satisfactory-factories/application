import { ref } from 'vue'
import { Edge, Position, useVueFlow } from '@vue-flow/core'
import { CustomNode } from '@/utils/graphUtils'
import dagre from '@dagrejs/dagre'

export function useLayout () {
  const { findNode } = useVueFlow()
  const graph = ref(new dagre.graphlib.Graph())
  const previousDirection = ref('LR')

  function layout (nodes: CustomNode[], edges: Edge[], direction = 'LR') {
    // Create a new graph instance to ensure it is fresh and does not have stale nodes/edges
    console.log('Initializing new dagre graph')
    const dagreGraph = new dagre.graphlib.Graph({ multigraph: true })
    dagreGraph.setGraph({
      rankdir: direction,
      marginx: 50,
      marginy: 50,
      ranksep: 175,
      nodesep: 100,
    })
    dagreGraph.setDefaultEdgeLabel(() => ({}))

    const isHorizontal = direction === 'LR'
    previousDirection.value = direction

    // Add nodes to the graph
    for (const node of nodes) {
      // Use the findNode function to access the node's dimensions (if already rendered)
      const graphNode = findNode(node.id)
      console.log(`Adding node to dagre graph: ${node.id}`, graphNode?.dimensions.width, graphNode?.dimensions.height, graphNode)

      // Set node dimensions in dagre (using defaults if no dimensions available)
      dagreGraph.setNode(node.id, {
        width: graphNode?.dimensions.width ?? 0,
        height: graphNode?.dimensions.height ?? 0,
      })
    }

    // Add edges to the graph
    for (const edge of edges) {
      console.log(`Adding edge: ${edge.source} -> ${edge.target}`)
      dagreGraph.setEdge(edge.source, edge.target)
    }

    // Compute layout with dagre
    console.log('Computing layout with dagre')
    dagre.layout(dagreGraph)

    console.log('Updated nodes', nodes)

    // Set nodes with updated positions from dagre layout
    return nodes.map(node => {
      const nodeWithPosition = dagreGraph.node(node.id)
      console.log(`Updating node position for: ${node.id}`, nodeWithPosition)

      return {
        ...node,
        targetPosition: isHorizontal ? Position.Left : Position.Top,
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
        position: {
          x: nodeWithPosition.x - (nodeWithPosition.width / 2),
          y: nodeWithPosition.y - (nodeWithPosition.height / 2),
        },
      }
    })
  }

  return { graph, layout, previousDirection }
}
