/**
 * The bearer token `GET /metrics` requires. **Unset means the endpoint does not exist**:
 * it answers 404 rather than serving, so forgetting the variable on a new box cannot
 * quietly publish an open metrics endpoint. Read from `process.env` at request time
 * rather than through ConfigService, which caches, so a test can set it per case.
 */
export const METRICS_TOKEN_VAR = 'METRICS_TOKEN'

/**
 * How long the cheap counts are reused. Four `countDocuments` and one `$group`, all fast.
 * At a 30s scrape this saves nothing on its own; it exists so that two scrapers, or a
 * scrape overlapping a manual check, do not both run the same queries.
 */
export const METRICS_CACHE_MS = 15_000

/**
 * How long the expensive statistics are reused: the three top-20 aggregations and the five
 * active-account windows. At a 30s scrape these refresh roughly every fourth scrape and
 * repeat in between, which is why the dashboard must not present them as sub-minute fresh.
 */
export const METRICS_SLOW_CACHE_MS = 120_000

/**
 * How many rows each identified metric exports per scrape.
 *
 * This bounds what leaves the database at any moment. It does **not** bound Prometheus
 * cardinality over time: every username or room id that ever enters the top 20 keeps a
 * series for the retention period after it drops out. At this service's size that is tens
 * of series, but it is not the same claim.
 */
export const METRICS_TOP_N = 20

/** The label used when a room's `createdBy` no longer resolves to an account. */
export const DELETED_OWNER = '(deleted)'

/** The windows `sf_active_accounts` reports, as label value to milliseconds. */
export const ACTIVE_ACCOUNT_WINDOWS: ReadonlyArray<readonly [string, number]> = [
  ['1h', 60 * 60 * 1000],
  ['24h', 24 * 60 * 60 * 1000],
  ['7d', 7 * 24 * 60 * 60 * 1000],
  ['14d', 14 * 24 * 60 * 60 * 1000],
  ['30d', 30 * 24 * 60 * 60 * 1000],
] as const

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
