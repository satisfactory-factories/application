import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import RawResourcesWizard from './RawResourcesWizard.vue'
import vuetify from '@/plugins/vuetify'
import { useAppStore } from '@/stores/app-store'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { downloadPlan } from '@/utils/plan-backup'

vi.mock('@/utils/plan-backup', () => ({
  downloadPlan: vi.fn(),
}))

// v-dialog teleports its content to the document body, so the controls are read from there.
const buttonLabelled = (label: string) =>
  [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(label))

const backupButton = () => document.body.querySelector<HTMLButtonElement>('#wizard-backup')

describe('RawResourcesWizard', () => {
  let appStore: ReturnType<typeof useAppStore>
  let subject: VueWrapper

  const backupBlob = () => vi.mocked(downloadPlan).mock.calls.at(-1)![0]

  // The backup button only appears on the review screen, which is where the "no undo" warning is.
  const openBackupScreen = async () => {
    // Mounted closed and then opened, as the planner does it — the dialog is always in the tree.
    subject = mount(RawResourcesWizard, {
      props: { modelValue: false },
      global: { plugins: [vuetify] },
    })
    await subject.setProps({ modelValue: true })
    await nextTick()

    const review = buttonLabelled('Review')
    if (!review) throw new Error('Review button not found')
    review.click()
    await nextTick()
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(downloadPlan).mockClear()
    localStorage.clear()
    setActivePinia(createPinia())
    appStore = useAppStore()

    // A factory short of iron ore: the wizard has something to offer, so it reaches the review
    // screen the backup button lives on.
    const factory = newFactory('Iron Ingots')
    addProductToFactory(factory, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    calculateFactories([factory], gameData)
    appStore.getCurrentTab().factories = [factory]
    appStore.getFactories()
  })

  afterEach(() => {
    subject?.unmount()
  })

  describe('downloadBackup', () => {
    // #536: the backup is the documented undo for a migration that cannot be reversed, and the
    // paste path writes powerTarget straight back onto the tab — so a 0 recorded here is stamped
    // in permanently.
    it('should record a legacy power target the tab does not carry', async () => {
      // A target set before it became plan-specific: it lives in localStorage, not on the tab.
      localStorage.setItem('powerTarget', '7500')
      expect(appStore.getCurrentTab().powerTarget).toBeUndefined()

      await openBackupScreen()
      backupButton()!.click()

      expect(downloadPlan).toHaveBeenCalled()
      expect(backupBlob().powerTarget).toBe(7500)
    })

    it("should record the plan's own power target in preference to the legacy one", async () => {
      localStorage.setItem('powerTarget', '7500')
      appStore.getCurrentTab().powerTarget = 3000

      await openBackupScreen()
      backupButton()!.click()

      expect(backupBlob().powerTarget).toBe(3000)
    })

    it('should record no target when neither the plan nor the legacy value has one', async () => {
      await openBackupScreen()
      backupButton()!.click()

      expect(backupBlob().powerTarget).toBe(0)
    })

    it('should back up the plan as it stands', async () => {
      const tab = appStore.getCurrentTab()
      tab.name = 'My Plan'

      await openBackupScreen()
      backupButton()!.click()

      const blob = backupBlob()
      expect(blob.name).toBe('My Plan')
      expect(blob.factories.map(factory => factory.name)).toEqual(['Iron Ingots'])
      // The plan's answer to the raw-resources change is backed up as it stands, so restoring
      // puts back the plan that was there rather than one that has to be asked all over again.
      expect(blob.plannerVersion).toBe(tab.plannerVersion)
    })
  })
})
