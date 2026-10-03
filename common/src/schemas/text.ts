import { z } from 'zod'

import { CAPS } from '../caps'
import { cleanText, findTextIssue, textRuleMessage } from '../text-rules'
import type { TextIssue, TextKind, TextRule } from '../text-rules'

/** Cleans, then rejects anything breaking a text rule. The issue carries the rule in `params`. */
export const textSchema = (kind: TextKind) => z.string()
  .max(CAPS.string)
  .transform((value, ctx) => {
    const cleaned = cleanText(value, kind)
    const rule = findTextIssue(cleaned, kind)
    if (!rule) return cleaned
    ctx.issues.push({
      code: 'custom',
      message: textRuleMessage(rule, kind),
      input: value,
      params: { textRule: rule },
    })
    return z.NEVER
  })

/** The first text-rule issue in a failed parse, or null when it failed for another reason. */
export const firstTextIssue = (error: z.ZodError): TextIssue | null => {
  for (const issue of error.issues) {
    const rule = issue.code === 'custom' ? (issue.params as { textRule?: TextRule } | undefined)?.textRule : undefined
    if (rule) return { path: issue.path.join('.'), rule, message: issue.message }
  }
  return null
}
