import { beforeEach, describe, expect, it } from 'vitest'
import { FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import {
  addTab, deleteTab,
  getCurrentTab,
  getTab,
  getTabAtIndex,
  migrateFactoryTabsToState,
  newState,
  newTab,
  regenerateTabOrders,
} from '@/utils/plannerStateManagement'
import { PlannerState } from '@/interfaces/planner/PlannerState'

describe('plannerStateManagement', () => {
  describe('newState', () => {
    it('should create a new state with default values', () => {
      const result = newState({})
      const firstTab = Object.values(result.tabs)[0]

      expect(result).toEqual({
        user: null,
        currentid: firstTab.id,
        lastSaved: null,
        userOptions: {
          satisfactionBreakdowns: false,
        },
        tabs: {
          [firstTab.id]: {
            id: firstTab.id,
            name: 'Default',
            displayOrder: 0,
            factories: [],
          },
        },
      })
    })

    it('should create a new state with custom values', () => {
      const result = newState({
        user: 'test',
        currentTabId: '1234',
        userOptions: {
          satisfactionBreakdowns: false,
        },
        tabs: {
          1234: {
            id: '1234',
            name: 'Test Tab',
            displayOrder: 0,
            factories: [],
          },
        },
      })

      expect(result).toEqual({
        user: 'test',
        currentid: '1234',
        lastSaved: null,
        userOptions: {
          satisfactionBreakdowns: false,
        },
        tabs: {
          1234: {
            id: '1234',
            name: 'Test Tab',
            displayOrder: 0,
            factories: [],
          },
        },
      })
    })
  })

  describe('newTab', () => {
    it('should create a new tab using default values', () => {
      const result = newTab()

      expect(result).toEqual({
        id: expect.any(String),
        name: 'Default',
        displayOrder: 0,
        factories: [],
      })
    })

    it('should create a new tab using custom values', () => {
      const result = newTab({
        id: '12345',
        name: 'Test Tab',
        displayOrder: 0,
        factories: [],
      })

      expect(result).toEqual({
        id: '12345',
        name: 'Test Tab',
        displayOrder: 0,
        factories: [],
      })
    })
  })

  describe('addTab', () => {
    it('should add a tab to the state', () => {
      const state = newState({})
      const existingTab = state.tabs[Object.keys(state.tabs)[0]]
      const tab = newTab()

      addTab(state, tab)

      expect(state.tabs).toEqual({
        [existingTab.id]: existingTab,
        [tab.id]: tab,
      })
      expect(tab.displayOrder).toBe(1)
    })
  })

  describe('getCurrentTab', () => {
    const state = newState({})
    const tab1 = state.tabs[Object.keys(state.tabs)[0]]
    addTab(state, newTab({ id: '1' }))

    it('should select the original tab', () => {
      const selectedTab = getCurrentTab(state)
      expect(selectedTab).toEqual(tab1)
    })
  })

  describe('getTab', () => {
    const state = newState({})
    const tab1 = state.tabs[Object.keys(state.tabs)[0]]
    addTab(state, newTab({ id: '1' }))

    it('should return the expected tab', () => {
      const result = getTab(state, tab1.id)
      expect(result).toEqual(tab1)
    })

    it('should throw an error if the tab does not exist', () => {
      expect(() => getTab(state, '2')).toThrowError('Tab with id 2 not found')
    })
  })

  describe('deleteTab', () => {
    let state: PlannerState
    let tab1: FactoryTab
    let tab2: FactoryTab

    beforeEach(() => {
      state = newState({})
      tab1 = state.tabs[Object.keys(state.tabs)[0]]
      tab2 = newTab({ id: '1337' })
      addTab(state, tab2)
    })

    it('should delete the correct tab from the state', () => {
      deleteTab(state, tab1)
      expect(state.tabs).toEqual({
        [tab2.id]: tab2,
      })
    })

    it('should re-order the display order of the tabs correctly', () => {
      // Add another tab for good measure
      addTab(state, newTab({ id: 'foo' }))
      const tab3 = getTab(state, 'foo')
      deleteTab(state, tab2)

      expect(state.tabs).toEqual({
        [tab1.id]: tab1,
        [tab3.id]: tab3,
      })
      expect(tab1.displayOrder).toBe(0)
      expect(tab3.displayOrder).toBe(1)
    })

    it('should select the last tab after deletion', () => {
      deleteTab(state, tab1)
      expect(state.currentTabId).toBe(tab2.id)
    })
  })

  describe('regenerateOrders', () => {
    // Ensure that the object properties are not returning the tabs in the wrong order.
    it('should regenerate the tab display orders correctly', () => {
      const state = newState({})
      const tab1 = getTabAtIndex(state, 0)
      const tab2 = newTab({ id: '1234545' })
      addTab(state, tab2)
      const tab3 = newTab({ id: 'foo' })
      addTab(state, tab3)

      regenerateTabOrders(state)

      expect(tab1.displayOrder).toBe(0)
      expect(tab2.displayOrder).toBe(1)
      expect(tab3.displayOrder).toBe(2)
    })
  })

  describe('migrateFactoryTabsToState', () => {
    let oldState: FactoryTab[]
    const mockFactory = newFactory('Iron Ingots', 0, 1)

    beforeEach(() => {
      oldState = [
        {
          id: 'foobar1',
          name: 'Tab 1',
          displayOrder: 0,
          factories: [mockFactory],
        },
        {
          id: 'foobar1337',
          name: 'Tab 2',
          displayOrder: 3, // Purposefully make this wrong
          factories: [],
        },
      ]
    })
    it('should perform the state migration successfully', () => {
      const newState = migrateFactoryTabsToState(oldState)

      expect(newState).toEqual({
        user: null,
        currentid: 'foobar1',
        lastSaved: null,
        userOptions: {
          satisfactionBreakdowns: false,
        },
        tabs: {
          foobar1: {
            id: 'foobar1',
            name: 'Tab 1',
            displayOrder: 0,
            factories: [mockFactory],
          },
          foobar1337: {
            id: 'foobar1337',
            name: 'Tab 2',
            displayOrder: 1,
            factories: [],
          },
        },
      })
    })
  })
})
