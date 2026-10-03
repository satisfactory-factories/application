import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, effectScope, h } from 'vue'
import { mount } from '@vue/test-utils'
import eventBus from '@/utils/eventBus'
import { useEventBusListener } from '@/composables/useEventBusListener'

describe('useEventBusListener', () => {
  afterEach(() => {
    eventBus.all.clear()
  })

  const handlerCount = () => eventBus.all.get('worldDataShow')?.length ?? 0

  it('removes its handler when the component unmounts', () => {
    const handler = vi.fn()
    const Listener = defineComponent({
      setup () {
        useEventBusListener('worldDataShow', handler)
        return () => h('div')
      },
    })

    const wrapper = mount(Listener)
    eventBus.emit('worldDataShow', true)
    expect(handler).toHaveBeenCalledWith(true)
    expect(handlerCount()).toBe(1)

    wrapper.unmount()
    eventBus.emit('worldDataShow', false)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handlerCount()).toBe(0)
  })

  it('does not accumulate handlers across repeated mounts', () => {
    const Listener = defineComponent({
      setup () {
        useEventBusListener('worldDataShow', () => {})
        return () => h('div')
      },
    })

    for (let i = 0; i < 5; i++) mount(Listener).unmount()
    expect(handlerCount()).toBe(0)
  })

  it('removes its handler when an effect scope is stopped', () => {
    const scope = effectScope()
    scope.run(() => useEventBusListener('worldDataShow', () => {}))
    expect(handlerCount()).toBe(1)
    scope.stop()
    expect(handlerCount()).toBe(0)
  })

  it('returns a stop function for use outside a scope', () => {
    const stop = useEventBusListener('worldDataShow', () => {})
    expect(handlerCount()).toBe(1)
    stop()
    expect(handlerCount()).toBe(0)
  })
})
