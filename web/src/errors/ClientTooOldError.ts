// The API refused a write because this build predates its minimum. A required reload, not an
// outage — the two must not be reported the same way.
export class ClientTooOldError extends Error {
  readonly minimumVersion: string

  constructor (minimumVersion = 'unknown', message = 'This version of the planner is too old to save to your account.') {
    super(message)
    this.name = 'ClientTooOldError'
    this.minimumVersion = minimumVersion
  }
}
