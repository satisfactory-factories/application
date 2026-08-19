import { computed, ref } from 'vue'

/**
 * Whether a factory row is currently in the air.
 *
 * Module scope so every group in both mounted sidebars sees a drag that started in any one of
 * them — the drop strips are only worth showing while there is something to drop, and the group
 * being dragged *into* is never the one the drag started from.
 */
const draggingFactory = ref(false)

/**
 * Whether a whole group is being reordered in the sidebar's group list. Module scope for the same
 * reason as above, plus one more: the planner shell reads it to hold a collapsed sidebar's peek
 * open for the duration of the drag, and it isn't the component the drag started in.
 */
const draggingGroup = ref(false)

/**
 * Either kind of sidebar drag. A drag started from a peeked (collapsed) sidebar would otherwise
 * dismiss the very tray it is happening in: starting a native drag fires a mouseleave on the row
 * underneath, and no mousemove arrives while the drag is in flight to peek it back out.
 */
const draggingSidebarItem = computed(() => draggingFactory.value || draggingGroup.value)

export const useFactoryDrag = () => ({ draggingFactory, draggingGroup, draggingSidebarItem })
