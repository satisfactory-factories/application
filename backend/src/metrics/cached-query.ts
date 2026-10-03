export interface CacheOutcome<T> {
  /** The freshest answer available, or null when nothing has ever loaded successfully. */
  value: T | null
  /** True only when this call performed a successful load. */
  refreshed: boolean
  /** True when a load was attempted and threw. The previous value, if any, still stands. */
  failed: boolean
}

/**
 * One cached answer, with the two properties a scrape endpoint needs and the naive version
 * lacks.
 *
 * **Coalescing.** Two scrapes arriving after the TTL expires must not both run the query. The
 * second awaits the first's in-flight promise instead. Without this, a slow aggregation and a
 * short interval let load pile up exactly when the database is already struggling.
 *
 * **Last good answer.** A failed load keeps the previous value rather than clearing it, so an
 * outage shows as a flat line plus `sf_metrics_database_up 0` rather than a cliff to zero. It
 * is the caller's job to report the failure; this only remembers.
 *
 * `refreshed` exists so a caller can tell a real reload from a cache hit, which matters for
 * gauges carrying dynamic labels: those must be reset and repopulated on a reload, and left
 * completely alone otherwise.
 */
export class CachedQuery<T> {
  private value: T | null = null
  private loadedAtMs = 0
  private inFlight: Promise<CacheOutcome<T>> | null = null

  constructor (
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
  ) {}

  async get (nowMs: number): Promise<CacheOutcome<T>> {
    if (this.value !== null && nowMs - this.loadedAtMs < this.ttlMs) {
      return { value: this.value, refreshed: false, failed: false }
    }

    this.inFlight ??= this.run(nowMs)
    return this.inFlight
  }

  private async run (nowMs: number): Promise<CacheOutcome<T>> {
    try {
      const loaded = await this.load()
      this.value = loaded
      this.loadedAtMs = nowMs
      return { value: loaded, refreshed: true, failed: false }
    } catch {
      return { value: this.value, refreshed: false, failed: true }
    } finally {
      // Cleared after the await settles, so every caller that joined this attempt gets its
      // result and only a later call starts a new one.
      this.inFlight = null
    }
  }
}
