import { ref } from 'vue'

/**
 * Whether a factory row is currently in the air.
 *
 * Module scope so every group in both mounted sidebars sees a drag that started in any one of
 * them — the drop strips are only worth showing while there is something to drop, and the group
 * being dragged *into* is never the one the drag started from.
 */
const draggingFactory = ref(false)

export const useFactoryDrag = () => ({ draggingFactory })
