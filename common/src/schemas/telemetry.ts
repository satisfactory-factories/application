import { z } from 'zod'

/**
 * The limits either side of the heartbeat agrees on.
 *
 * The counts are absurd on purpose. No planner has 100,000 tabs; the cap exists so a
 * garbage or hostile client cannot push a nonsense number into a gauge, not to describe
 * anything a real user does.
 */
export const TELEMETRY_CAPS = {
  /** A version string, and nothing longer. */
  appVersion: 32,
  /** Every count field. */
  count: 100_000,
  /** The whole request body, in bytes. A real heartbeat is around 200. */
  bodyBytes: 2048,
  /** How long an instance still counts as active after its last heartbeat. */
  activeWindowMs: 15 * 60 * 1000,
  /** How often a browser sends one. */
  intervalMs: 5 * 60 * 1000,
} as const

/**
 * What may appear as the `version` label on `sf_clients_by_version`.
 *
 * A label value is a cardinality risk rather than a display problem: Prometheus keeps one
 * time series per distinct value, a client is free to send whatever it likes, and nothing
 * reclaims a series that stops being written to. Anything not matching this is bucketed as
 * `other` by the server rather than rejected, so an odd build still gets counted.
 */
export const TELEMETRY_VERSION_LABEL_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[A-Za-z0-9.]{1,20})?$/

/** Where a version that fails the pattern, or overflows the label cap, is counted instead. */
export const TELEMETRY_VERSION_FALLBACK = 'other'

const count = z.number().int().min(0).max(TELEMETRY_CAPS.count)

/**
 * The anonymous usage heartbeat a browser posts to `POST /telemetry`, so that local tabs
 * and signed-out users are countable at all — the server holds no record of either.
 *
 * **Every field here is a count, a flag or a version string.** `instanceId` is a random
 * UUID the browser mints for itself and keeps in localStorage; it is never derived from,
 * hashed from, or stored beside an account, a username or an email, and the server never
 * joins it to one. `signedIn` says only *that* somebody is signed in, never who. Nothing
 * carries a plan name, a factory name, a room id or an account id, and nothing may be
 * added here that does.
 *
 * Strict rather than stripping, which is the opposite of every other schema in this
 * package. Stripping an unknown key fails silently, and the thing being kept out is a
 * field carrying a name or an id that some later change added without meaning to. A
 * heartbeat is fire-and-forget, so rejecting one costs nothing, and the specs pin the
 * exact key set so that adding a field is a decision somebody has to make twice.
 */
export const telemetryHeartbeatSchema = z.strictObject({
  instanceId: z.uuid(),
  signedIn: z.boolean(),
  tabCount: count,
  localTabCount: count,
  cloudTabCount: count,
  factoriesTotal: count,
  appVersion: z.string().min(1).max(TELEMETRY_CAPS.appVersion),
})

export type TelemetryHeartbeat = z.infer<typeof telemetryHeartbeatSchema>

export const parseTelemetryHeartbeat = (input: unknown) => telemetryHeartbeatSchema.safeParse(input)
