import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFactoryDrag } from '@/composables/useFactoryDrag'

const { draggingFactory, draggingGroup, draggingSidebarItem } = useFactoryDrag()

describe('useFactoryDrag', () => {
  beforeEach(() => {
    draggingFactory.value = false
    draggingGroup.value = false
  })

  it('is shared state across callers', () => {
    useFactoryDrag().draggingGroup.value = true
    expect(draggingGroup.value).toBe(true)
  })

  it('reports no sidebar drag when nothing is in the air', () => {
    expect(draggingSidebarItem.value).toBe(false)
  })

  it.each([
    ['factory row', draggingFactory],
    ['group', draggingGroup],
  ])('reports a sidebar drag while a %s is in the air', (_label, flag) => {
    flag.value = true
    expect(draggingSidebarItem.value).toBe(true)

    flag.value = false
    expect(draggingSidebarItem.value).toBe(false)
  })
})

// The flag is read from matchMedia once, at module load, so each case needs its own module
// instance — hence resetModules and a dynamic import rather than the shared one above.
describe('useFactoryDrag: dragEnabled', () => {
  const matchMedia = window.matchMedia

  // One mutable stand-in for the MediaQueryList, so a case can flip the pointer under a module
  // that has already read it — which is what the composable's change listener is there for.
  const load = async (coarse: boolean) => {
    const listeners: Array<() => void> = []
    const query = {
      matches: coarse,
      addEventListener: (_event: string, listener: () => void) => listeners.push(listener),
      removeEventListener: () => {},
    }
    window.matchMedia = (() => query) as unknown as typeof window.matchMedia

    vi.resetModules()
    const module = await import('@/composables/useFactoryDrag')
    return { drag: module.useFactoryDrag(), query, listeners }
  }

  afterEach(() => {
    window.matchMedia = matchMedia
    vi.resetModules()
  })

  it('offers drag to a fine pointer', async () => {
    const { drag } = await load(false)
    expect(drag.dragEnabled.value).toBe(true)
  })

  // The gesture that picks a row up is the gesture that scrolls the sidebar.
  it('withholds it from a coarse one', async () => {
    const { drag } = await load(true)
    expect(drag.dragEnabled.value).toBe(false)
  })

  it('follows a device that gains or loses a mouse mid-session', async () => {
    const { drag, query, listeners } = await load(true)
    expect(drag.dragEnabled.value).toBe(false)

    query.matches = false
    listeners.forEach(listener => listener())

    expect(drag.dragEnabled.value).toBe(true)
  })
})
