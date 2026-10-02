import type { TextIssue } from 'common'

import { ApiError } from '@/api/client'

interface NamedFactory { name?: unknown }

/**
 * A server path such as `factories.3.notes` turned into a sentence naming the factory,
 * so the user can find the field. Falls back to the bare rule message.
 */
export const describeTextIssue = (
  issue: TextIssue,
  content?: { factories?: NamedFactory[] } | null,
): string => {
  const match = /^(?:diff\.)?factories\.(\d+)\./.exec(issue.path)
  const factory = match ? content?.factories?.[Number(match[1])] : undefined
  const name = typeof factory?.name === 'string' && factory.name.trim() ? factory.name.trim() : null
  return name ? `${issue.message} Check the factory "${name}".` : issue.message
}

/** The text issue a REST refusal carried, if that is why it was refused. */
export const textIssueOf = (error: unknown): TextIssue | null => {
  if (!(error instanceof ApiError) || error.code !== 'invalid_text') return null
  const issue = (error.body as { textIssue?: TextIssue } | null)?.textIssue
  return issue ?? null
}
