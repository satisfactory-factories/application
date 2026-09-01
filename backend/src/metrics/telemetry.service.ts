import { Inject, Injectable } from '@nestjs/common'
import {
  TELEMETRY_CAPS,
  TELEMETRY_VERSION_FALLBACK,
  TELEMETRY_VERSION_LABEL_PATTERN,
} from 'common'
import type { TelemetryHeartbeat } from 'common'

import { CLOCK, Clock } from '../rooms/clock'
import {
  METRICS_VERSION_LABEL_LIMIT,
  TELEMETRY_MAX_INSTANCES,
  TELEMETRY_MIN_INTERVAL_MS,
} from './metrics.constants'

/**
 * What one browser last told us. Deliberately not a copy of the heartbeat: the instance id
 * is the map key and nothing else identifying is kept, because nothing else is sent.
 */
interface TrackedInstance {
  lastSeenMs: number
  signedIn: boolean
  localTabs: number
  cloudTabs: number
  factories: number
  version: string
}

export interface TelemetrySnapshot {
  activeSignedIn: number
  activeSignedOut: number
  localTabs: number
  cloudTabs: number
  factories: number
  /** Version label to instance count, already capped and bucketed. */
  byVersion: Map<string, number>
}

export type HeartbeatOutcome = 'accepted' | 'too-soon' | 'at-capacity'

/**
 * The live client census, held in memory and nowhere else.
 *
 * There are no Mongo writes here on purpose. The API is a single standalone instance, a
 * heartbeat is worth nothing fifteen minutes after it arrives, and writing one per browser
 * per five minutes would be the busiest collection in the database in exchange for data
 * that is never read back. A restart loses the census and it refills within five minutes.
 *
 * Entries expire {@link TELEMETRY_CAPS.activeWindowMs} after their last heartbeat. Expiry
 * happens on the way past — every record and every snapshot prunes — so there is no timer
 * to leak and an idle process holds nothing.
 */
@Injectable()
export class TelemetryService {
  private readonly instances = new Map<string, TrackedInstance>()

  constructor (@Inject(CLOCK) private readonly clock: Clock) {}

  record (heartbeat: TelemetryHeartbeat): HeartbeatOutcome {
    const nowMs = this.clock.now().getTime()
    this.prune(nowMs)

    const existing = this.instances.get(heartbeat.instanceId)
    if (existing && nowMs - existing.lastSeenMs < TELEMETRY_MIN_INTERVAL_MS) {
      // Refused without touching lastSeen, so hammering the endpoint cannot hold an
      // instance active past its window.
      return 'too-soon'
    }
    if (!existing && this.instances.size >= TELEMETRY_MAX_INSTANCES) return 'at-capacity'

    this.instances.set(heartbeat.instanceId, {
      lastSeenMs: nowMs,
      signedIn: heartbeat.signedIn,
      localTabs: heartbeat.localTabCount,
      cloudTabs: heartbeat.cloudTabCount,
      factories: heartbeat.factoriesTotal,
      version: heartbeat.appVersion,
    })

    return 'accepted'
  }

  snapshot (): TelemetrySnapshot {
    const nowMs = this.clock.now().getTime()
    this.prune(nowMs)

    const snapshot: TelemetrySnapshot = {
      activeSignedIn: 0,
      activeSignedOut: 0,
      localTabs: 0,
      cloudTabs: 0,
      factories: 0,
      byVersion: new Map(),
    }
    const rawVersions = new Map<string, number>()

    for (const instance of this.instances.values()) {
      if (instance.signedIn) snapshot.activeSignedIn++
      else snapshot.activeSignedOut++
      snapshot.localTabs += instance.localTabs
      snapshot.cloudTabs += instance.cloudTabs
      snapshot.factories += instance.factories

      const label = versionLabel(instance.version)
      rawVersions.set(label, (rawVersions.get(label) ?? 0) + 1)
    }

    snapshot.byVersion = capVersions(rawVersions)
    return snapshot
  }

  /** Live instances, for the specs and for nothing else. */
  size (): number {
    this.prune(this.clock.now().getTime())
    return this.instances.size
  }

  private prune (nowMs: number): void {
    for (const [instanceId, instance] of this.instances) {
      if (nowMs - instance.lastSeenMs >= TELEMETRY_CAPS.activeWindowMs) this.instances.delete(instanceId)
    }
  }
}

/** Anything the shared pattern does not recognise is counted, just not under its own name. */
const versionLabel = (version: string): string =>
  TELEMETRY_VERSION_LABEL_PATTERN.test(version) ? version : TELEMETRY_VERSION_FALLBACK

/**
 * Keeps the busiest {@link METRICS_VERSION_LABEL_LIMIT} versions and folds the tail into
 * `other`, so the series count is bounded no matter how many well-formed versions arrive.
 * Sorted by count first and by name second, so a tie does not make the choice arbitrary
 * between scrapes.
 */
const capVersions = (counts: Map<string, number>): Map<string, number> => {
  if (counts.size <= METRICS_VERSION_LABEL_LIMIT) return counts

  const ranked = [...counts].sort(([nameA, countA], [nameB, countB]) =>
    countB - countA || nameA.localeCompare(nameB))

  const capped = new Map(ranked.slice(0, METRICS_VERSION_LABEL_LIMIT))
  const tail = ranked.slice(METRICS_VERSION_LABEL_LIMIT)
    .reduce((total, [, count]) => total + count, 0)

  capped.set(TELEMETRY_VERSION_FALLBACK, (capped.get(TELEMETRY_VERSION_FALLBACK) ?? 0) + tail)
  return capped
}
