import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import {
  TELEMETRY_CAPS,
  TELEMETRY_SHA_FALLBACK,
  TELEMETRY_SHA_LABEL_PATTERN,
  TELEMETRY_VERSION_FALLBACK,
  TELEMETRY_VERSION_LABEL_PATTERN,
} from 'common'
import type { Model } from 'mongoose'
import type { TelemetryHeartbeat } from 'common'

import { CLOCK, Clock } from '../rooms/clock'
import {
  METRICS_VERSION_LABEL_LIMIT,
  TELEMETRY_MAX_INSTANCES,
  TELEMETRY_MIN_INTERVAL_MS,
} from './metrics.constants'
import { TelemetryInstance } from './telemetry-instance.schema'

export interface TelemetrySnapshot {
  activeSignedIn: number
  activeSignedOut: number
  localTabs: number
  cloudTabs: number
  factories: number
  /** Version label to instance count, already capped and bucketed. */
  byVersion: Map<string, number>
  /** Commit label to instance count, capped and bucketed the same way. */
  bySha: Map<string, number>
}

export type HeartbeatOutcome = 'accepted' | 'too-soon' | 'at-capacity'

/**
 * The live client census.
 *
 * Stored in Mongo rather than in memory. The first version kept a `Map`, on the reasoning
 * that a heartbeat is worthless fifteen minutes later and a write per browser per five
 * minutes would be the busiest collection here. The first half holds; the second was
 * overstated, because that rate is trivial. What the `Map` really cost was the entire census
 * on every deploy, and the API redeploys often enough that people noticed.
 *
 * Rows expire {@link TELEMETRY_CAPS.activeWindowMs} after their last heartbeat, enforced two
 * ways: a TTL index bounds storage, and every read filters on `lastSeenAt` so the window is
 * exact rather than "whenever Mongo last swept".
 */
@Injectable()
export class TelemetryService {
  constructor (
    @InjectModel(TelemetryInstance.name)
    private readonly instances: Model<TelemetryInstance>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async record (heartbeat: TelemetryHeartbeat): Promise<HeartbeatOutcome> {
    const now = this.clock.now()
    const floor = new Date(now.getTime() - TELEMETRY_MIN_INTERVAL_MS)

    // `$lte`, not `$lt`: the in-memory version this replaces accepted a heartbeat arriving
    // exactly on the floor, and tightening that by a millisecond during a port would be an
    // accidental behaviour change.
    // One conditional upsert does the rate limit and the write together: it only matches a
    // row that is absent or old enough, so a burst cannot be accepted twice. Doing it as a
    // read then a write would let two concurrent heartbeats both pass the check.
    const result = await this.instances.updateOne(
      { instanceId: heartbeat.instanceId, lastSeenAt: { $lte: floor } },
      {
        $set: {
          lastSeenAt: now,
          signedIn: heartbeat.signedIn,
          localTabs: heartbeat.localTabCount,
          cloudTabs: heartbeat.cloudTabCount,
          factories: heartbeat.factoriesTotal,
          version: heartbeat.appVersion,
          sha: heartbeat.gitSha ?? '',
        },
      },
      { upsert: true },
    ).catch(async (cause: unknown) => {
      // A duplicate key means the row exists and was too recent for the filter to match, so
      // the upsert tried to insert a second one. That is exactly the rate limit firing.
      if (isDuplicateKey(cause)) return null
      throw cause
    })

    if (result === null) return 'too-soon'
    if (result.matchedCount === 0 && result.upsertedCount === 0) return 'too-soon'

    // Checked after the write rather than before, so the common path is one round trip. An
    // overshoot of a few rows past the cap is not worth a second query on every heartbeat.
    if (result.upsertedCount > 0 && await this.instances.estimatedDocumentCount() > TELEMETRY_MAX_INSTANCES) {
      await this.instances.deleteOne({ instanceId: heartbeat.instanceId })
      return 'at-capacity'
    }

    return 'accepted'
  }

  async snapshot (): Promise<TelemetrySnapshot> {
    const since = new Date(this.clock.now().getTime() - TELEMETRY_CAPS.activeWindowMs)
    const active = await this.instances
      .find({ lastSeenAt: { $gt: since } }, { signedIn: 1, localTabs: 1, cloudTabs: 1, factories: 1, version: 1, sha: 1 })
      .lean()

    const snapshot: TelemetrySnapshot = {
      activeSignedIn: 0,
      activeSignedOut: 0,
      localTabs: 0,
      cloudTabs: 0,
      factories: 0,
      byVersion: new Map(),
      bySha: new Map(),
    }
    const rawVersions = new Map<string, number>()
    const rawShas = new Map<string, number>()

    for (const instance of active) {
      if (instance.signedIn) snapshot.activeSignedIn++
      else snapshot.activeSignedOut++
      snapshot.localTabs += instance.localTabs
      snapshot.cloudTabs += instance.cloudTabs
      snapshot.factories += instance.factories

      const version = versionLabel(instance.version)
      rawVersions.set(version, (rawVersions.get(version) ?? 0) + 1)

      const sha = shaLabel(instance.sha)
      rawShas.set(sha, (rawShas.get(sha) ?? 0) + 1)
    }

    snapshot.byVersion = capLabels(rawVersions, TELEMETRY_VERSION_FALLBACK)
    snapshot.bySha = capLabels(rawShas, TELEMETRY_SHA_FALLBACK)
    return snapshot
  }

  /** Instances still inside the window, for the specs and for nothing else. */
  async size (): Promise<number> {
    const since = new Date(this.clock.now().getTime() - TELEMETRY_CAPS.activeWindowMs)
    return this.instances.countDocuments({ lastSeenAt: { $gt: since } })
  }
}

const isDuplicateKey = (cause: unknown): boolean =>
  typeof cause === 'object' && cause !== null && (cause as { code?: number }).code === 11000

/** Anything the shared pattern does not recognise is counted, just not under its own name. */
const versionLabel = (version: string): string =>
  TELEMETRY_VERSION_LABEL_PATTERN.test(version) ? version : TELEMETRY_VERSION_FALLBACK

/** A build that reported no commit, or something that is not hex, counts under `unknown`. */
const shaLabel = (sha: string): string =>
  TELEMETRY_SHA_LABEL_PATTERN.test(sha) ? sha : TELEMETRY_SHA_FALLBACK

/**
 * Keeps the busiest {@link METRICS_VERSION_LABEL_LIMIT} labels and folds the tail into the
 * given fallback, so the series count is bounded no matter how many distinct values arrive.
 * Shared by the version and commit labels: a commit is if anything the more dangerous of the
 * two, since every merge mints a new one.
 *
 * Sorted by count first and by name second, so a tie does not make the choice arbitrary
 * between scrapes.
 */
const capLabels = (counts: Map<string, number>, fallback: string): Map<string, number> => {
  if (counts.size <= METRICS_VERSION_LABEL_LIMIT) return counts

  const ranked = [...counts].sort(([nameA, countA], [nameB, countB]) =>
    countB - countA || nameA.localeCompare(nameB))

  const capped = new Map(ranked.slice(0, METRICS_VERSION_LABEL_LIMIT))
  const tail = ranked.slice(METRICS_VERSION_LABEL_LIMIT)
    .reduce((total, [, count]) => total + count, 0)

  capped.set(fallback, (capped.get(fallback) ?? 0) + tail)
  return capped
}
