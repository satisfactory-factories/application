import { beforeEach, describe, expect, it } from 'vitest'
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
