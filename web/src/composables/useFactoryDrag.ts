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

/**
 * Whether reordering by drag is offered at all.
 *
 * On a touchscreen the gesture that picks a row up is the same one that scrolls the sidebar, so
 * every attempt to scroll past a factory dragged it instead and the sidebar could not be used.
 * Sortable has no way to tell the two apart, so drag is treated as a pointer-precision feature:
 * where the primary pointer is coarse it is off, and the Arrange dialog's buttons do the job.
 *
 * `(pointer: coarse)` rather than a width breakpoint, so a touchscreen laptop driven by its
 * trackpad keeps drag and a large tablet does not.
 */
const dragEnabled = ref(true)

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const coarse = window.matchMedia('(pointer: coarse)')
  const apply = () => {
    dragEnabled.value = !coarse.matches
  }
  apply()
  // A device can gain or lose a mouse mid-session, and Safari only grew addEventListener here in 14.
  coarse.addEventListener?.('change', apply)
}

export const useFactoryDrag = () => ({
  draggingFactory,
  draggingGroup,
  draggingSidebarItem,
  dragEnabled,
})
