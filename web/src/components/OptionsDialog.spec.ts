import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { gameData } from '@/utils/gameData'

// The preview builds a real Limestone mine, so it needs the recipes behind it.
vi.mock('@/stores/game-data-store', () => ({
  useGameDataStore: () => ({
    getGameData: () => gameData,
    loadGameData: async () => {},
  }),
}))

import OptionsDialog from './OptionsDialog.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { usePlannerOptions } from '@/composables/usePlannerOptions'

const settle = async () => {
  await nextTick()
  await nextTick()
}

// The preview's inputs debounce their solve, so an edit needs real time to pass before the
// group has moved — two ticks only get as far as the value the user typed.
const settleDebounce = async () => {
  await new Promise(resolve => setTimeout(resolve, 900))
  await settle()
}

const open = async () => {
  (document.getElementById('options-button') as HTMLElement).click()
  await settle()
}

const text = (id: string) => document.getElementById(id)?.textContent?.trim()
const value = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value

describe('OptionsDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    usePlannerOptions().value.balanceTolerancePercent = 1
  })

  describe('the effective output tolerance preview', () => {
    it('starts on a mine the default calls balanced', async () => {
      vuetifyRender(OptionsDialog)
      await open()

      // 5 Miner Mk.1s at 99.2% is 297.6/min against the 300 asked for, and 1% of 300 is 3.
      expect(value('balance-preview-buildings')).toBe('5')
      expect(value('balance-preview-clock')).toBe('99.2')
      expect(text('balance-tolerance-preview-status')).toContain('Balanced')
    })

    it('turns the same mine red on a tighter tolerance', async () => {
      vuetifyRender(OptionsDialog)
      await open()

      usePlannerOptions().value.balanceTolerancePercent = 0.5
      await settle()

      // 0.5% of 300 is 1.5/min, and the mine is 2.4/min short.
      expect(text('balance-tolerance-preview-status')).toContain('Under producing!')
    })

    // Vuetify inputs are flex: 1 1 auto. Once the sentence beside this one wrapped to a second
    // line it grew into the space left on the first, so the field was 130px at 360/min and 636px
    // at 350 — the same field, five times wider, for a value one digit long either way.
    it('keeps the amount field from growing when the row beside it wraps', async () => {
      vuetifyRender(OptionsDialog)
      await open()

      const field = document.getElementById('balance-preview-amount')?.closest('.v-input')

      expect(field?.classList.contains('flex-grow-0')).toBe(true)
      expect(field?.classList.contains('flex-shrink-0')).toBe(true)
    })

    it('is a real building group, so typing an output re-solves the buildings and clock', async () => {
      vuetifyRender(OptionsDialog)
      await open()

      const output = document.getElementById('balance-preview-output') as HTMLInputElement
      output.value = '300'
      output.dispatchEvent(new Event('input', { bubbles: true }))
      output.dispatchEvent(new Event('change', { bubbles: true }))
      await settleDebounce()

      // Through the planner's own solver: 300/min is 5 Mk.1s, so it drops the underclock.
      expect(value('balance-preview-buildings')).toBe('5')
      expect(value('balance-preview-clock')).toBe('100')
      expect(text('balance-tolerance-preview-status')).toContain('Balanced')
    })
  })
})
