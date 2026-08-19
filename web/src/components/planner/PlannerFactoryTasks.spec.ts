import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import draggable from 'vuedraggable'
import PlannerFactoryTasks from './PlannerFactoryTasks.vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'

describe('Component: PlannerFactoryTasks', () => {
  let factory: Factory

  const mountSubject = () =>
    mount(PlannerFactoryTasks, {
      propsData: { factory, helpText: false },
      global: { plugins: [vuetify] },
    })

  // Sortable has already moved the DOM by the time it reports; the component's job is to
  // make the model agree with it.
  const drag = (subject: VueWrapper, oldIndex: number, newIndex: number) =>
    subject.findComponent(draggable).vm.$emit('change', { moved: { oldIndex, newIndex } })

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = newFactory('Test')
    factory.tasks = [
      { title: 'Alpha', completed: false },
      { title: 'Bravo', completed: false },
      { title: 'Charlie', completed: false },
    ]
  })

  it('moves a task down the list', () => {
    drag(mountSubject(), 0, 2)

    expect(factory.tasks.map(task => task.title)).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })

  it('moves a task up the list', () => {
    drag(mountSubject(), 2, 0)

    expect(factory.tasks.map(task => task.title)).toEqual(['Charlie', 'Alpha', 'Bravo'])
  })

  it('leaves the order alone for a drag that did not move anything', () => {
    const subject = mountSubject()
    subject.findComponent(draggable).vm.$emit('change', {})

    expect(factory.tasks.map(task => task.title)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('keeps the completed flag with its task across a reorder', () => {
    factory.tasks[0].completed = true
    drag(mountSubject(), 0, 2)

    expect(factory.tasks.map(task => task.completed)).toEqual([false, false, true])
  })

  it('puts the drag handle and the done checkbox left of the title, and delete on the right', () => {
    const cells = mountSubject().find('tbody tr').findAll('td')

    expect(cells.map(cell => cell.classes().join(' '))).toEqual(['handle', 'toggle', 'title', 'actions'])
    expect(cells[0].find('.task-drag-handle').exists()).toBe(true)
    expect(cells[1].find('input.task-tick[type="checkbox"]').exists()).toBe(true)
    expect(cells[3].find('.v-btn').classes()).toContain('v-btn--variant-outlined')
  })

  // The title is edited through the row slot's element rather than the factory array directly,
  // so this is the check that the slot still hands back the reactive task.
  it('edits write back to the task', async () => {
    const subject = mountSubject()
    await subject.findAll('tbody tr')[1].find('textarea').setValue('Bravo edited')

    expect(factory.tasks.map(task => task.title)).toEqual(['Alpha', 'Bravo edited', 'Charlie'])
  })

  it('ticking a task only touches that task', async () => {
    const subject = mountSubject()
    await subject.findAll('tbody tr')[1].find('td.toggle input').setValue(true)

    expect(factory.tasks.map(task => task.completed)).toEqual([false, true, false])
  })

  it('unticking a done task puts it back', async () => {
    factory.tasks[1].completed = true
    const subject = mountSubject()
    await subject.findAll('tbody tr')[1].find('td.toggle input').setValue(false)

    expect(factory.tasks.map(task => task.completed)).toEqual([false, false, false])
  })

  describe('adding a task', () => {
    const newTaskField = (subject: VueWrapper) => subject.find('.v-text-field input')

    it('adds the task when the field loses focus', async () => {
      const subject = mountSubject()
      const field = newTaskField(subject)
      await field.setValue('Delta')
      await field.trigger('blur')

      expect(factory.tasks.map(task => task.title)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
      expect((field.element as HTMLInputElement).value).toBe('')
    })

    it('adds the task on enter', async () => {
      const subject = mountSubject()
      const field = newTaskField(subject)
      await field.setValue('Delta')
      await field.trigger('keyup.enter')

      expect(factory.tasks.map(task => task.title)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
    })

    // Enter clears the field, so the blur that follows when the user clicks away must not
    // add a second, empty task.
    it('does not add the task twice when enter is followed by a blur', async () => {
      const subject = mountSubject()
      const field = newTaskField(subject)
      await field.setValue('Delta')
      await field.trigger('keyup.enter')
      await field.trigger('blur')

      expect(factory.tasks.map(task => task.title)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
    })

    it('ignores a blur with nothing typed', async () => {
      const subject = mountSubject()
      await newTaskField(subject).trigger('blur')

      expect(factory.tasks.map(task => task.title)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    })

    it('ignores a blur with only whitespace typed', async () => {
      const subject = mountSubject()
      const field = newTaskField(subject)
      await field.setValue('   ')
      await field.trigger('blur')

      expect(factory.tasks.map(task => task.title)).toEqual(['Alpha', 'Bravo', 'Charlie'])
      expect((field.element as HTMLInputElement).value).toBe('')
    })

    it('trims the title it stores', async () => {
      const subject = mountSubject()
      const field = newTaskField(subject)
      await field.setValue('  Delta  ')
      await field.trigger('blur')

      expect(factory.tasks[3].title).toBe('Delta')
    })
  })
})
