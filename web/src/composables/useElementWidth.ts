import { onBeforeUnmount, type Ref, ref, watch } from 'vue'

/**
 * The live content width of an element, in pixels.
 *
 * `contentRect` rather than `offsetWidth` so padding is already excluded — what a caller wants is
 * the space it has to lay things out in. Zero is reported as "not measured yet": a hidden sidebar
 * collapses every element inside it to nothing, and forgetting the last real width would relayout
 * on the way back in for no reason.
 */
export const useElementWidth = (target: Ref<HTMLElement | undefined>) => {
  const width = ref(0)
  let observer: ResizeObserver | undefined

  const stop = () => {
    observer?.disconnect()
    observer = undefined
  }

  watch(target, el => {
    stop()
    if (!el || typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width ?? 0
      if (measured > 0) width.value = measured
    })
    observer.observe(el)
    // A post-flush watch, because a template ref is only populated once the DOM it names has been
    // patched — a pre-flush one runs a tick early and observes nothing at all.
  }, { immediate: true, flush: 'post' })

  onBeforeUnmount(stop)

  return { width }
}
