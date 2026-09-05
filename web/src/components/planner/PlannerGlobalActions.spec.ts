import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlannerGlobalActions from './PlannerGlobalActions.vue'
import Tooltip from '@/components/tooltip.vue'
import { useAppStore } from '@/stores/app-store'
import { usePowerTarget } from '@/composables/usePowerTarget'
import { usePlannerOptions } from '@/composables/usePlannerOptions'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

// The copy/paste plan buttons must carry the plan's power target (a tab-level
// field) alongside the factories, while still accepting the legacy array-only blob.
describe('Component: PlannerGlobalActions clipboard', () => {
  let appStore: ReturnType<typeof useAppStore>
  let readText: ReturnType<typeof vi.fn>
  let writeText: ReturnType<typeof vi.fn>

  const mountSubject = () =>
    mount(PlannerGlobalActions, {
      global: {
        plugins: [vuetify],
        stubs: { Templates: true },
      },
    })

  const clickButton = (subject: VueWrapper, text: string) => {
    const button = subject.findAll('button').find(b => b.text().includes(text))
    if (!button) throw new Error(`Button "${text}" not found`)
    return button.trigger('click')
  }

  /**
   * The paste handler reads the clipboard and then applies the plan behind a 250ms
   * timer, so every test here used to wait 300ms and hope. The plan landing is the
   * thing to wait for, and `prepareLoader` is where it lands — spied in every test
   * that pastes, and the last call the handler makes.
   */
  const pasteApplied = async () => {
    await vi.waitFor(() => {
      expect(vi.mocked(appStore.prepareLoader)).toHaveBeenCalled()
    }, { timeout: 2000 })
    await flushPromises()
  }

  const seedFactory = () => {
    // Give the current tab a factory so the (disabled-when-empty) Copy button is live,
    // then trigger init so getFactories() returns it.
    appStore.getCurrentTab().factories = [newFactory('Test')]
    appStore.getFactories()
  }

  beforeEach(() => {
    localStorage.removeItem('factoryTabs')
    setActivePinia(createPinia())
    appStore = useAppStore()

    writeText = vi.fn()
    readText = vi.fn()
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } })
    // confirmReplace() calls window.confirm when a plan already exists.
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  // Every button in this row hints at what it does, and does it the same way as the rest of the
  // app. A native `title` is not that: it looks nothing like a v-tooltip, and a browser shows
  // none at all for a disabled control — which is half of these on an empty plan.
  it('wraps every button in a tooltip, and none carries a native title', () => {
    const subject = mountSubject()
    const buttons = subject.findAll('button')

    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.filter(b => b.attributes('title') !== undefined)).toHaveLength(0)
    expect(subject.findAllComponents(Tooltip)).toHaveLength(buttons.length)
    expect(subject.findAllComponents(Tooltip).every(t => !!t.props('text'))).toBe(true)
  })

  // A greyed-out button that says nothing is the case a native title could never cover, and the
  // reason all of these are disabled is the same one.
  it('explains why each button is disabled on an empty plan', () => {
    const subject = mountSubject()
    const hints = subject.findAllComponents(Tooltip).map(t => t.props('text') as string)

    for (const label of ['hide', 'expand', 'clear', 'copy', 'recalculate']) {
      expect(hints.some(hint => hint.startsWith(`Nothing to ${label} yet`))).toBe(true)
    }
  })

  // The one button here that holds a state rather than firing an action, and it is the only
  // control for it — so a plan opened on a wide monitor has to come back full width next time.
  it('full width button toggles the stored option', async () => {
    localStorage.removeItem('plannerOptions')
    const options = usePlannerOptions()
    options.value.fullWidth = false

    const subject = mountSubject()
    expect(subject.text()).toContain('Full width')

    await clickButton(subject, 'Full width')

    expect(options.value.fullWidth).toBe(true)
    expect(subject.text()).toContain('Normal width')

    await clickButton(subject, 'Normal width')

    expect(options.value.fullWidth).toBe(false)
  })

  it('copy serializes the full tab (name, factories, powerTarget)', () => {
    seedFactory()
    appStore.getCurrentTab().name = 'My Plan'
    usePowerTarget().powerTarget.value = 5000

    const subject = mountSubject()
    clickButton(subject, 'Copy plan')

    expect(writeText).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(writeText.mock.calls[0][0])
    expect(payload.name).toBe('My Plan')
    expect(payload.powerTarget).toBe(5000)
    expect(Array.isArray(payload.factories)).toBe(true)
    expect(payload.factories).toHaveLength(1)
  })

  it('paste of a full tab replaces the current tab name, target and factories', async () => {
    seedFactory()
    appStore.getCurrentTab().name = 'Original'
    const prepareLoader = vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify({ name: 'Pasted Plan', factories: [newFactory('Pasted')], powerTarget: 1234 }))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await pasteApplied()

    expect(prepareLoader).toHaveBeenCalledTimes(1)
    expect(prepareLoader.mock.calls[0][0]).toHaveLength(1)
    expect(appStore.getCurrentTab().powerTarget).toBe(1234)
    expect(appStore.getCurrentTab().name).toBe('Pasted Plan')
  })

  /**
   * A plan pasted in after signing in used to have nothing pointing at the cloud:
   * the offer to sync what this browser holds is made at sign-in and then the
   * browser stops asking. The paste raises it for the plan that just landed, once
   * the load is done — the loading overlay is persistent and would sit over it.
   */
  /**
   * Announced as the plan is dropped in, naming the tab it went into. That is all
   * this component knows; waiting for the load that draws it belongs to whoever
   * acts on it, so nothing here listens to loads it did not start.
   */
  it('announces the pasted plan, naming the tab it landed in', async () => {
    const landed = vi.fn()
    eventBus.on('planLanded', landed)
    vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify({ name: 'Pasted Plan', factories: [newFactory('Pasted')] }))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await pasteApplied()

    expect(landed).toHaveBeenCalledWith(appStore.getCurrentTab().id)
    eventBus.off('planLanded', landed)
    subject.unmount()
  })

  it('announces nothing when a plan is merely loaded or recalculated', async () => {
    const landed = vi.fn()
    eventBus.on('planLanded', landed)
    mountSubject()

    eventBus.emit('loadingCompleted')
    eventBus.emit('calculationsCompleted')
    await flushPromises()

    expect(landed).not.toHaveBeenCalled()
    eventBus.off('planLanded', landed)
  })

  /**
   * Delete already tells you who loses what; a paste destroys the same thing for the
   * same people. "Your plan" was written when every tab was local, and on a cloud tab
   * it is the one sentence standing between a plan and every device it is open on.
   */
  describe('the warning before it replaces anything', () => {
    const warningFor = async (state?: Record<string, unknown>) => {
      seedFactory()
      appStore.getCurrentTab().name = 'Iron Backbone'
      if (state) appStore.setTabState(appStore.getCurrentTab().id, state as never)
      // Declined, so nothing is pasted and the wording is all this test is about.
      vi.mocked(window.confirm).mockReturnValue(false)

      const subject = mountSubject()
      await clickButton(subject, 'Paste plan')
      const asked = vi.mocked(window.confirm).mock.calls.at(-1)?.[0]
      subject.unmount()
      return asked
    }

    it('says nothing about the cloud for a plan that lives in this browser', async () => {
      expect(await warningFor()).toBe('This will replace your plan. Are you sure?')
    })

    it('names the plan and every device for a cloud plan you own', async () => {
      const asked = await warningFor({ kind: 'synced', shared: false, role: 'owner', revision: 1 })

      expect(asked).toContain('"Iron Backbone"')
      expect(asked).toContain('on your account, on every device you are signed in on')
    })

    it('names the people you shared it with once it is shared', async () => {
      const asked = await warningFor({ kind: 'synced', shared: true, role: 'owner', revision: 1 })

      expect(asked).toContain('"Iron Backbone"')
      expect(asked).toContain('for everyone you have shared it with')
    })

    it('tells a member they are replacing the owner\'s copy', async () => {
      const asked = await warningFor({ kind: 'synced', shared: true, role: 'member', revision: 1 })

      expect(asked).toContain('for everyone in this plan, including its owner')
    })

    it('says the same to a visitor who joined by link', async () => {
      const asked = await warningFor({ kind: 'joined', shared: true, role: 'member', revision: null })

      expect(asked).toContain('for everyone in this plan, including its owner')
    })

    // Nothing to lose, cloud or not: asking here would make the prompt routine.
    it('asks nothing at all when the tab is empty', async () => {
      appStore.setTabState(appStore.getCurrentTab().id, { kind: 'synced', shared: true, role: 'owner', revision: 1 })
      readText.mockResolvedValue(JSON.stringify({ name: 'Pasted', factories: [] }))

      const subject = mountSubject()
      await clickButton(subject, 'Paste plan')

      expect(window.confirm).not.toHaveBeenCalled()
      subject.unmount()
    })

    it('declining leaves the clipboard unread and the plan alone', async () => {
      await warningFor({ kind: 'synced', shared: false, role: 'owner', revision: 1 })

      expect(readText).not.toHaveBeenCalled()
    })
  })

  // Groups with members ride on the factories and need no help. Memberless ones live only on the
  // tab, so the clipboard is the one place they can be lost — or left behind.
  it('copy carries the memberless groups the factories cannot', () => {
    seedFactory()
    appStore.getCurrentTab().groups = [{ id: 'g1', name: 'Empty', color: '#4caf50', order: 0 }]

    const subject = mountSubject()
    clickButton(subject, 'Copy plan')

    const payload = JSON.parse(writeText.mock.calls[0][0])
    expect(payload.groups).toEqual([{ id: 'g1', name: 'Empty', color: '#4caf50', order: 0 }])
  })

  // The tiers describe the save the plan was written against, so they travel with it. Absent
  // reads as fully researched, which is why paste assigns them even when the blob has none.
  it('copy carries the Depot research the plan was written against', () => {
    seedFactory()
    appStore.getCurrentTab().depotUploadTier = 0
    appStore.getCurrentTab().depotExpansionTier = 1

    const subject = mountSubject()
    clickButton(subject, 'Copy plan')

    const payload = JSON.parse(writeText.mock.calls[0][0])
    expect(payload.depotUploadTier).toBe(0)
    expect(payload.depotExpansionTier).toBe(1)
  })

  it('paste replaces the destination tab\'s Depot research with the pasted plan\'s', async () => {
    seedFactory()
    appStore.getCurrentTab().depotUploadTier = 4
    appStore.getCurrentTab().depotExpansionTier = 4
    vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify({
      factories: [newFactory('Pasted')],
      powerTarget: 0,
      depotUploadTier: 0,
      depotExpansionTier: 2,
    }))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await pasteApplied()

    expect(appStore.getCurrentTab().depotUploadTier).toBe(0)
    expect(appStore.getCurrentTab().depotExpansionTier).toBe(2)
  })

  it('paste of a plan from before the tiers clears the outgoing tab\'s', async () => {
    seedFactory()
    appStore.getCurrentTab().depotUploadTier = 0
    appStore.getCurrentTab().depotExpansionTier = 0
    vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify({ factories: [newFactory('Pasted')], powerTarget: 0 }))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await pasteApplied()

    expect(appStore.getCurrentTab().depotUploadTier).toBeUndefined()
    expect(appStore.getCurrentTab().depotExpansionTier).toBeUndefined()
  })

  it('paste replaces the destination tab\'s memberless groups with the pasted plan\'s', async () => {
    seedFactory()
    appStore.getCurrentTab().groups = [{ id: 'old', name: 'Outgoing', color: '#4caf50', order: 0 }]
    vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify({
      factories: [newFactory('Pasted')],
      powerTarget: 0,
      groups: [{ id: 'new', name: 'Incoming', color: '#2196f3', order: 0 }],
    }))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await pasteApplied()

    expect(appStore.getCurrentTab().groups).toEqual([
      { id: 'new', name: 'Incoming', color: '#2196f3', order: 0 },
    ])
  })

  it('paste of a plan with no memberless groups leaves none behind', async () => {
    seedFactory()
    appStore.getCurrentTab().groups = [{ id: 'old', name: 'Outgoing', color: '#4caf50', order: 0 }]
    vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify({ factories: [newFactory('Pasted')], powerTarget: 0 }))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await pasteApplied()

    expect(appStore.getCurrentTab().groups).toBeUndefined()
  })

  it('paste of a legacy array leaves no memberless groups behind either', async () => {
    seedFactory()
    appStore.getCurrentTab().groups = [{ id: 'old', name: 'Outgoing', color: '#4caf50', order: 0 }]
    vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify([newFactory('Legacy')]))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await pasteApplied()

    expect(appStore.getCurrentTab().groups).toBeUndefined()
  })

  it('paste of a legacy array loads factories and leaves tab settings untouched', async () => {
    seedFactory()
    appStore.getCurrentTab().name = 'Keep Me'
    usePowerTarget().powerTarget.value = 4000
    const prepareLoader = vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify([newFactory('Legacy')]))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await pasteApplied()

    expect(prepareLoader).toHaveBeenCalledTimes(1)
    expect(prepareLoader.mock.calls[0][0]).toHaveLength(1)
    // Legacy blobs carry no name/target, so the existing tab settings are preserved.
    expect(appStore.getCurrentTab().powerTarget).toBe(4000)
    expect(appStore.getCurrentTab().name).toBe('Keep Me')
  })
})
