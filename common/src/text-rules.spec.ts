import { describe, expect, it } from 'vitest'

import { CAPS } from './caps'
import { LINK_REMOVED, cleanText, findTabTextIssue, findTextIssue, sanitiseFactoryText, sanitiseTabText, sanitiseText, textFieldRule } from './text-rules'

const blob = 'aGVsbG8gd29ybGQgdGhpcyBpcyBhIGJsb2IgdGVzdA'

describe('cleanText', () => {
  it('strips invisible characters and trims names', () => {
    expect(cleanText('  Caterium\t', 'name')).toBe('Caterium')
    expect(cleanText('Iron​Plates', 'name')).toBe('Iron Plates')
    expect(cleanText('a\nb', 'task')).toBe('a b')
  })

  it('keeps line breaks and trailing space in notes', () => {
    expect(cleanText('line one\nline two ', 'notes')).toBe('line one\nline two ')
    expect(cleanText('zero​width', 'notes')).toBe('zerowidth')
  })
})

describe('findTextIssue', () => {
  it.each([
    ['Fuel -> Generators 01'],
    ['120 iron > 10 rotor'],
    ['[VsLkOvl][Alu Sheet/Casing] Vista Lake Overlook'],
    ['NF.IO'],
    ['Factory.io inspired layout'],
    ['Plaques renforcées, cadres modulaires'],
    ['Import iron from the north'],
    ['Stator (15/min), Automated Wiring (11.25/min) 🚀'],
  ])('allows real names: %s', value => {
    expect(findTextIssue(value, 'name')).toBeNull()
  })

  it.each([
    ['{"a": 1}', 'braces'],
    ['use `this`', 'braces'],
    ['see https://example.test/x', 'link'],
    ['www.example.test', 'link'],
    ['go to example.com now', 'link'],
    [`payload ${blob}`, 'encoded'],
    [`hash ${'ab12'.repeat(10)}`, 'encoded'],
    ['x'.repeat(CAPS.name + 1), 'too_long'],
  ] as const)('rejects %s as %s', (value, rule) => {
    expect(findTextIssue(value, 'name')).toBe(rule)
  })

  it('rejects an unbroken word past the limit for the kind', () => {
    const word = 'Ab-'.repeat(15)
    expect(findTextIssue(word, 'name')).toBe('long_word')
    expect(findTextIssue(word, 'task')).toBeNull()
  })

  it('flags long notes with almost no spaces as scrambled', () => {
    expect(findTextIssue('Qx!-z.'.repeat(10) + ' ok', 'notes')).toBe('scrambled')
    expect(findTextIssue('A normal note about oil.\nAnother line about coal.', 'notes')).toBeNull()
  })

  it('applies the cap of the kind', () => {
    expect(findTextIssue('a '.repeat(CAPS.notes / 2), 'notes')).toBeNull()
    expect(findTextIssue('a '.repeat(CAPS.notes / 2) + 'a', 'notes')).toBe('too_long')
  })
})

describe('textFieldRule', () => {
  it('returns true or the message to show', () => {
    expect(textFieldRule('notes')('fine')).toBe(true)
    expect(textFieldRule('notes')('see www.example.test')).toBe("Notes can't contain links.")
  })
})

describe('sanitiseText', () => {
  it('replaces links and drops braces', () => {
    expect(sanitiseText('Guide: https://example.test/a?b=c here', 'notes')).toBe(`Guide: ${LINK_REMOVED} here`)
    expect(sanitiseText('{Iron}', 'name')).toBe('Iron')
  })

  it('cuts to the cap and trims names', () => {
    expect(sanitiseText(` ${'word '.repeat(60)}`, 'name')).toHaveLength(CAPS.name - 1)
  })

  it('drops text it cannot repair', () => {
    expect(sanitiseText(blob, 'notes')).toBe('')
  })

  it('leaves clean text alone', () => {
    expect(sanitiseText('Feeds the assembly line', 'notes')).toBe('Feeds the assembly line')
  })
})

describe('sanitiseTabText', () => {
  it('repairs every text field in a tab and says whether anything changed', () => {
    const tab = {
      name: ' Plan ',
      groups: [{ name: 'Group\t' }],
      factories: [{
        name: 'Iron',
        notes: 'see https://example.test',
        tasks: [{ title: 'do {this}' }],
        group: { name: 'Group\t' },
      }],
    }

    expect(sanitiseTabText(tab)).toBe(true)
    expect(tab).toEqual({
      name: 'Plan',
      groups: [{ name: 'Group' }],
      factories: [{
        name: 'Iron',
        notes: `see ${LINK_REMOVED}`,
        tasks: [{ title: 'do this' }],
        group: { name: 'Group' },
      }],
    })
    expect(sanitiseTabText(tab)).toBe(false)
  })

  it('survives junk', () => {
    expect(sanitiseTabText(null)).toBe(false)
    expect(sanitiseFactoryText({ name: 3, tasks: 'x' })).toBe(false)
  })
})

describe('findTabTextIssue', () => {
  it('names the first field the server would refuse, by its server path', () => {
    const tab = { name: 'Plan', factories: [{ name: 'Iron', notes: '' }, { name: 'Copper', tasks: [{ title: 'ok' }, { title: '{x}' }] }] }
    expect(findTabTextIssue(tab)).toMatchObject({ path: 'factories.1.tasks.1.title', rule: 'braces' })
  })

  it('is null for a clean tab and for junk', () => {
    expect(findTabTextIssue({ name: 'Plan', factories: [{ name: 'Iron', notes: 'fine' }] })).toBeNull()
    expect(findTabTextIssue(null)).toBeNull()
  })
})
