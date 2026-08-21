/** Raised whenever a file does not look like a save we can read, including a truncated one. */
export class SaveFormatError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'SaveFormatError'
  }
}
