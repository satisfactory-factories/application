/**
 * The bearer token `GET /metrics` requires. **Unset means the endpoint does not exist**:
 * it answers 404 rather than serving, so forgetting the variable on a new box cannot
 * quietly publish an open metrics endpoint. Read from `process.env` at request time
 * rather than through ConfigService, which caches, so a test can set it per case.
 */
export const METRICS_TOKEN_VAR = 'METRICS_TOKEN'

/**
 * How long a scrape's database counts are reused. Prometheus scrapes every 15-60s, more
 * than one scraper is normal, and these five numbers move slowly; without this each
 * scrape is five queries for an answer that has not changed.
 */
export const METRICS_CACHE_MS = 10_000

/**
 * The most *named* versions `sf_clients_by_version` will ever mint, busiest kept and the
 * tail folded into `other` — so the series count tops out at this plus the `other` bucket
 * itself. The label pattern already rejects garbage, so this is the second wall: for
 * garbage that is well-formed, a thousand plausible version numbers from one script.
 */
export const METRICS_VERSION_LABEL_LIMIT = 25

/**
 * Instances held in memory at once. Bounds the map against a client minting ids in a
 * loop; past it, a heartbeat from an unknown instance is refused until the window
 * expires some. Roughly 100 bytes an entry, so this is single-digit megabytes.
 */
export const TELEMETRY_MAX_INSTANCES = 50_000

/**
 * The least time between two accepted heartbeats from one instance, which is what makes
 * the endpoint per-instance rate limited rather than only per-address. Well below the
 * client's 5 minute cadence, so an ordinary heartbeat is never refused; a page reloaded
 * three times in a row is, and its second and third carry nothing new anyway.
 */
export const TELEMETRY_MIN_INTERVAL_MS = 30_000
