import { CAPS } from './caps'

// The sanity rules for user-written text: names, notes and task titles. One rulebook,
// run by the planner as the user types and by the server on every write. Sized against
// the production data in October 2026, where only links tripped any of them.

export type TextKind = 'name' | 'notes' | 'task'

export type TextRule =
  | 'too_long'
  | 'braces'
  | 'link'
  | 'encoded'
  | 'long_word'
  | 'scrambled'

/** A rule break, as the server reports it back to the planner. */
export interface TextIssue {
  /** Dotted path to the field, e.g. `factories.3.notes`. */
  path: string
  rule: TextRule
  message: string
}

export const TEXT_CAPS: Record<TextKind, number> = {
  name: CAPS.name,
  notes: CAPS.notes,
  task: CAPS.taskTitle,
}

const LONGEST_WORD: Record<TextKind, number> = { name: 40, notes: 60, task: 60 }

/** Control and zero-width characters. Line breaks survive in notes only. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g
const LINE_BREAKS = /[\r\n]+/g
const BRACES = /[{}`]/
const BRACES_GLOBAL = /[{}`]/g
// A bare domain counts only when written in lowercase from a word start, so "NF.IO"
// and "Factory.io" stay names while "factory.io" is a link.
const LINK = /https?:\/\/|\bwww\.|(?<![\w.])[a-z0-9-]{2,}\.(?:com|net|org|io|gg|co|uk|de|ru|xyz|top|me|to|tv|app|dev|info|onion|ly|link|site|online|cc|su|biz)\b/
const LINK_GLOBAL = /(?:https?:\/\/|\bwww\.)\S*|(?<![\w.])[a-z0-9-]{2,}\.(?:com|net|org|io|gg|co|uk|de|ru|xyz|top|me|to|tv|app|dev|info|onion|ly|link|site|online|cc|su|biz)\b\S*/g
const ENCODED = /[A-Za-z0-9+/]{32,}={0,2}|[0-9a-fA-F]{32,}/

export const LINK_REMOVED = '[link removed]'

/**
 * What the server stores: invisible characters gone, names and task titles trimmed and
 * kept to one line. Notes keep their line breaks and their trailing space, since the
 * planner sends them mid-typing.
 */
export const cleanText = (value: string, kind: TextKind): string => {
  const visible = value.replace(INVISIBLE, kind === 'notes' ? '' : ' ').replace(/\t/g, ' ')
  if (kind === 'notes') return visible
  return visible.replace(LINE_BREAKS, ' ').trim()
}

/** The first rule a text breaks, or null. Expects text that has been through `cleanText`. */
export const findTextIssue = (value: string, kind: TextKind): TextRule | null => {
  if (value.length > TEXT_CAPS[kind]) return 'too_long'
  if (BRACES.test(value)) return 'braces'
  if (LINK.test(value)) return 'link'
  if (ENCODED.test(value)) return 'encoded'
  if (new RegExp(`\\S{${LONGEST_WORD[kind] + 1},}`).test(value)) return 'long_word'
  if (kind === 'notes' && looksScrambled(value)) return 'scrambled'
  return null
}

/** Real notes are words: a long note with almost no spaces is a blob. */
const looksScrambled = (value: string): boolean => {
  const flat = value.replace(LINE_BREAKS, '')
  if (flat.length <= 40) return false
  const spaces = (flat.match(/[ \t]/g) ?? []).length
  return spaces / flat.length < 0.05
}

const FIELD_LABEL: Record<TextKind, string> = { name: 'Names', notes: 'Notes', task: 'Tasks' }

export const textRuleMessage = (rule: TextRule, kind: TextKind): string => {
  const field = FIELD_LABEL[kind]
  switch (rule) {
    case 'too_long': return `${field} can be at most ${TEXT_CAPS[kind]} characters.`
    case 'braces': return `${field} can't contain curly brackets or backticks.`
    case 'link': return `${field} can't contain links.`
    case 'encoded': return `${field} can't contain long runs of code-like characters.`
    case 'long_word': return `${field} can't contain words longer than ${LONGEST_WORD[kind]} characters.`
    case 'scrambled': return `${field} need some spaces between the words.`
  }
}

/** The planner's field check: true, or the message to show under the field. */
export const textFieldRule = (kind: TextKind) => (value: unknown): true | string => {
  if (typeof value !== 'string') return true
  const rule = findTextIssue(cleanText(value, kind), kind)
  return rule ? textRuleMessage(rule, kind) : true
}

/**
 * Repairs text written before these rules existed, so an old plan never has an edit
 * refused for a note nobody touched. Anything still unsafe after the repair is dropped.
 */
export const sanitiseText = (value: string, kind: TextKind): string => {
  const repaired = cleanText(value, kind)
    .replace(LINK_GLOBAL, LINK_REMOVED)
    .replace(BRACES_GLOBAL, '')
    .slice(0, TEXT_CAPS[kind])
  const result = kind === 'notes' ? repaired : repaired.trim()
  return findTextIssue(result, kind) ? '' : result
}

type Loose = Record<string, unknown>
const isRecord = (value: unknown): value is Loose => typeof value === 'object' && value !== null

/** Writes `sanitiseText` over one field if it is a string. Returns whether it changed. */
const repairField = (target: Loose, key: string, kind: TextKind): boolean => {
  const value = target[key]
  if (typeof value !== 'string') return false
  const repaired = sanitiseText(value, kind)
  if (repaired === value) return false
  target[key] = repaired
  return true
}

/** Repairs a factory's name, notes, task titles and carried group name in place. */
export const sanitiseFactoryText = (factory: unknown): boolean => {
  if (!isRecord(factory)) return false
  let changed = repairField(factory, 'name', 'name')
  changed = repairField(factory, 'notes', 'notes') || changed
  if (Array.isArray(factory.tasks)) {
    for (const task of factory.tasks) if (isRecord(task)) changed = repairField(task, 'title', 'task') || changed
  }
  if (isRecord(factory.group)) changed = repairField(factory.group, 'name', 'name') || changed
  return changed
}

/** The same over a whole tab: its name, its group registry and every factory. */
export const sanitiseTabText = (tab: unknown): boolean => {
  if (!isRecord(tab)) return false
  let changed = repairField(tab, 'name', 'name')
  if (Array.isArray(tab.groups)) {
    for (const group of tab.groups) if (isRecord(group)) changed = repairField(group, 'name', 'name') || changed
  }
  if (Array.isArray(tab.factories)) {
    for (const factory of tab.factories) changed = sanitiseFactoryText(factory) || changed
  }
  return changed
}

const issueAt = (target: Loose, key: string, kind: TextKind, path: string): TextIssue | null => {
  const value = target[key]
  if (typeof value !== 'string') return null
  const rule = findTextIssue(cleanText(value, kind), kind)
  return rule ? { path, rule, message: textRuleMessage(rule, kind) } : null
}

/** The first text field in a tab or diff the server would refuse, using the server's paths. */
export const findTabTextIssue = (tab: unknown): TextIssue | null => {
  if (!isRecord(tab)) return null
  const named = issueAt(tab, 'name', 'name', 'name')
  if (named) return named
  if (Array.isArray(tab.groups)) {
    for (const [index, group] of tab.groups.entries()) {
      const issue = isRecord(group) ? issueAt(group, 'name', 'name', `groups.${index}.name`) : null
      if (issue) return issue
    }
  }
  if (!Array.isArray(tab.factories)) return null
  for (const [index, factory] of tab.factories.entries()) {
    if (!isRecord(factory)) continue
    const at = `factories.${index}`
    const issue = issueAt(factory, 'name', 'name', `${at}.name`) ??
      issueAt(factory, 'notes', 'notes', `${at}.notes`) ??
      (isRecord(factory.group) ? issueAt(factory.group, 'name', 'name', `${at}.group.name`) : null)
    if (issue) return issue
    if (!Array.isArray(factory.tasks)) continue
    for (const [taskIndex, task] of factory.tasks.entries()) {
      const taskIssue = isRecord(task) ? issueAt(task, 'title', 'task', `${at}.tasks.${taskIndex}.title`) : null
      if (taskIssue) return taskIssue
    }
  }
  return null
}
