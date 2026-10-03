import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { describeTextIssue, textIssueOf } from '@/utils/text-issues'

const issue = { path: 'factories.1.notes', rule: 'link' as const, message: "Notes can't contain links." }

describe('describeTextIssue', () => {
  it('names the factory the path points at', () => {
    const content = { factories: [{ name: 'Iron' }, { name: 'Copper Wire' }] }
    expect(describeTextIssue(issue, content)).toBe(`Notes can't contain links. Check the factory "Copper Wire".`)
    expect(describeTextIssue({ ...issue, path: 'diff.factories.0.notes' }, content)).toContain('"Iron"')
  })

  it('falls back to the rule message', () => {
    expect(describeTextIssue({ ...issue, path: 'name' }, { factories: [] })).toBe(issue.message)
    expect(describeTextIssue(issue)).toBe(issue.message)
  })
})

describe('textIssueOf', () => {
  it('reads the issue off an invalid_text refusal only', () => {
    expect(textIssueOf(new ApiError(400, 'x', { code: 'invalid_text', textIssue: issue }))).toEqual(issue)
    expect(textIssueOf(new ApiError(400, 'x', { code: 'invalid_payload' }))).toBeNull()
    expect(textIssueOf(new Error('x'))).toBeNull()
  })
})
