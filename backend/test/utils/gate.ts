/**
 * A promise a test opens by hand. Parking one side of a race inside a real code path
 * is how these suites stage an interleaving without serialising the two sides with
 * awaits, which would prove nothing.
 */
export class Gate {
  /** Arrivals, so a test can prove the seam was actually reached. */
  entered = 0

  private open!: () => void
  private readonly opened = new Promise<void>(resolve => { this.open = resolve })

  async wait (): Promise<void> {
    this.entered += 1
    await this.opened
  }

  release (): void {
    this.open()
  }
}

/** Polls until the condition holds, so a test never races the seam it installed. */
export const until = async (
  condition: () => boolean,
  what: string,
  timeoutMs = 5_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
