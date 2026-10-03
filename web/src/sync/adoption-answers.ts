import { writeLocalStorage } from '@/utils/safe-storage'

/**
 * Who has answered the adoption offer in this browser, kept per account.
 *
 * The offer is about the local plans this browser holds, so the answer lives
 * here rather than on the server, but it is an answer given *for one account*.
 * A single browser-wide flag silenced the question for every account that ever
 * signed in afterwards, which is exactly wrong for the account that has never
 * been asked: someone who declines on their own account and then registers a
 * second one is owed the offer.
 */
export const ADOPTION_ANSWERED_KEY = 'adoptionOfferAnswered'

/** Accounts that have answered. Absent is unasked; there is no "no" to store. */
export type AdoptionAnswers = Record<string, true>

export const readAdoptionAnswers = (): AdoptionAnswers => {
  const raw = localStorage.getItem(ADOPTION_ANSWERED_KEY)
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  // The shape before accounts was the bare literal `true`. v0.7 has not shipped,
  // so it is read as nobody having answered rather than migrated onto whichever
  // account happens to be signing in. Being asked once more beats being silenced.
  if (typeof parsed !== 'object' || parsed === null) return {}

  const answers: AdoptionAnswers = {}
  for (const [account, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === true && account !== '') answers[account] = true
  }
  return answers
}

export const hasAnsweredAdoption = (account: string): boolean =>
  account !== '' && readAdoptionAnswers()[account] === true

/** Idempotent, and a no-op with no account: an answer belongs to somebody. */
export const rememberAdoptionAnswer = (account: string): void => {
  if (account === '' || hasAnsweredAdoption(account)) return

  const answers = readAdoptionAnswers()
  answers[account] = true
  writeLocalStorage(ADOPTION_ANSWERED_KEY, JSON.stringify(answers))
}
