import { describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import AppDialog from './AppDialog.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'

// v-dialog teleports into the body, so everything here is read off the document rather than the
// wrapper.
const card = () => document.querySelector('.v-card')
const title = () => document.querySelector('.v-card-title')
const body = () => document.querySelector('.v-card-text')
const closeButton = () => title()?.querySelector('button') as HTMLElement | undefined

const open = (props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) => {
  document.body.innerHTML = ''
  return vuetifyRender(AppDialog, {
    props: { modelValue: true, title: 'Options', ...props },
    slots,
  })
}

describe('AppDialog', () => {
  // The traits the whole app now shares. If any of these move, every dialog moves with them,
  // which is the point of the wrapper existing at all.
  it('should give the title row real vertical padding, the icon beside the label', async () => {
    open({ icon: 'fas fa-wrench' })
    await nextTick()

    expect(title()?.classList.contains('py-4')).toBe(true)
    expect(title()?.classList.contains('align-center')).toBe(true)
    expect(title()?.querySelector('i')?.className).toContain('fa-wrench')
    expect(title()?.textContent).toContain('Options')
  })

  it('should put the way out in the top-right corner, not the actions row', async () => {
    open()
    await nextTick()

    expect(closeButton()).toBeTruthy()
    expect(closeButton()?.getAttribute('title')).toBe('Close Options')
  })

  it('should close when the corner button is pressed', async () => {
    const wrapper = open()
    await nextTick()
    closeButton()?.click()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('should withhold the corner close from a dialog that demands an answer', async () => {
    open({ closable: false, persistent: true })
    await nextTick()

    expect(closeButton()).toBeFalsy()
  })

  it('should render the body at text-body-2, keeping any extra classes given to it', async () => {
    open({ bodyClass: 'pa-0' })
    await nextTick()

    expect(body()?.classList.contains('text-body-2')).toBe(true)
    expect(body()?.classList.contains('pa-0')).toBe(true)
  })

  it('should only draw an actions row when something is put in it', async () => {
    open()
    await nextTick()
    expect(document.querySelector('.v-card-actions')).toBeFalsy()

    open({}, { actions: () => h('button', 'Got it') })
    await nextTick()
    expect(document.querySelector('.v-card-actions')?.textContent).toContain('Got it')
  })

  // Markup titles (a game asset, a factory icon) replace the whole label; the corner close is not
  // part of what they replace.
  it('should keep the corner close when the title is supplied as markup', async () => {
    open({ closeTitle: 'Close icon picker' }, { title: () => h('span', 'Icon for "Copper Mine"') })
    await nextTick()

    expect(title()?.textContent).toContain('Icon for "Copper Mine"')
    expect(closeButton()?.getAttribute('title')).toBe('Close icon picker')
  })

  it('should cap the body height when asked, for the dialogs whose body is a long list', async () => {
    open({ bodyMaxHeight: '60vh' })
    await nextTick()

    expect((body() as HTMLElement)?.style.maxHeight).toBe('60vh')
    expect(card()).toBeTruthy()
  })
})
