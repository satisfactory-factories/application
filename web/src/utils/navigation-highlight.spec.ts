import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flashElement, NAV_FLASH_CLASS, NAV_FLASH_DURATION, resolveFlashTarget } from '@/utils/navigation-highlight'

describe('navigation-highlight', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('resolveFlashTarget', () => {
    it('should flash a row itself, having no heading to aim at', () => {
      document.body.innerHTML = '<div id="row"><span>Iron Ingot</span></div>'
      const row = document.getElementById('row')!

      expect(resolveFlashTarget(row)).toBe(row)
    })

    it('should flash a factory card on its header, not the whole card', () => {
      document.body.innerHTML = `
        <div id="card">
          <div class="header">Factory 1</div>
          <div class="body"><h1>Imports</h1></div>
        </div>`
      const card = document.getElementById('card')!

      expect(resolveFlashTarget(card)).toBe(card.querySelector('.header'))
    })

    it('should flash a section on its heading', () => {
      document.body.innerHTML = '<div id="section"><h1>Imports</h1><div>rows</div></div>'
      const section = document.getElementById('section')!

      expect(resolveFlashTarget(section)).toBe(section.querySelector('h1'))
    })

    it('should prefer an explicitly marked heading over anything found by shape', () => {
      document.body.innerHTML = `
        <div id="section">
          <div class="header">shape</div>
          <div data-nav-flash>explicit</div>
        </div>`
      const section = document.getElementById('section')!

      expect(resolveFlashTarget(section)).toBe(section.querySelector('[data-nav-flash]'))
    })
  })

  describe('flashElement', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('should pulse the element and clean the class up afterwards', () => {
      document.body.innerHTML = '<div id="row"></div>'
      const row = document.getElementById('row')!

      flashElement(row)
      expect(row.classList.contains(NAV_FLASH_CLASS)).toBe(true)

      vi.advanceTimersByTime(NAV_FLASH_DURATION)
      expect(row.classList.contains(NAV_FLASH_CLASS)).toBe(false)
    })

    it('should pulse the heading when handed a container', () => {
      document.body.innerHTML = '<div id="card"><div class="header"></div></div>'
      const card = document.getElementById('card')!

      flashElement(card)

      expect(card.classList.contains(NAV_FLASH_CLASS)).toBe(false)
      expect(card.querySelector('.header')!.classList.contains(NAV_FLASH_CLASS)).toBe(true)
    })

    it('should replay on a repeat jump rather than let the first cleanup cut it short', () => {
      document.body.innerHTML = '<div id="row"></div>'
      const row = document.getElementById('row')!

      flashElement(row)
      vi.advanceTimersByTime(NAV_FLASH_DURATION / 2)
      flashElement(row)

      // Where the first flash's cleanup would have landed, mid-way through the second pulse.
      vi.advanceTimersByTime(NAV_FLASH_DURATION / 2)
      expect(row.classList.contains(NAV_FLASH_CLASS)).toBe(true)

      vi.advanceTimersByTime(NAV_FLASH_DURATION / 2)
      expect(row.classList.contains(NAV_FLASH_CLASS)).toBe(false)
    })
  })
})
