import { Counter, Registry } from 'prom-client'
import { EVENT_REASONS, EVENT_SOURCES } from 'common'
import { Injectable } from '@nestjs/common'
import type { EventReason, EventSource } from 'common'

/**
 * The error counters, and nothing else.
 *
 * **This service depends on nothing, and nothing may make it depend on anything.** It is
 * imported by the modules that report errors — rooms, realtime, auth, health, metrics — and
 * `MetricsModule` already imports all of those to read from them. A counter that lived in
 * MetricsModule would reverse those edges and put a cycle in the graph, which is the same
 * problem `UserActivityService` was extracted to solve.
 *
 * It owns its own registry for the same reason. `MetricsService` merges the two at render
 * time rather than owning these counters, so nothing here needs to know that it exists.
 *
 * Counters, not gauges. These accumulate, and Prometheus stores the accumulation for its whole
 * retention and handles a process restart natively. Persisting them would duplicate what
 * Prometheus already does, and would put a database write on the path that runs fastest when
 * something is already going wrong.
 */
@Injectable()
export class EventCountersService {
  readonly registry = new Registry()

  private readonly events: Counter<'source' | 'reason'>
  private readonly httpErrors: Counter<'status'>

  constructor () {
    this.events = new Counter({
      name: 'sf_events_total',
      help: 'Faults by reason. Client reasons arrive over POST /events and are indicative rather than authoritative: the endpoint is unauthenticated and anonymous.',
      labelNames: ['source', 'reason'],
      registers: [this.registry],
    })

    this.httpErrors = new Counter({
      name: 'sf_http_errors_total',
      help: 'HTTP error responses by status. A per-response view; sf_events_total is a per-cause view. One incident can appear in both, so do not add them together.',
      labelNames: ['status'],
      registers: [this.registry],
    })

    // Every series starts at zero rather than appearing on first use. Without this a reason
    // that has never fired is absent, and absent reads as "no data" on a panel rather than as
    // the good news it actually is.
    for (const source of EVENT_SOURCES) {
      for (const reason of EVENT_REASONS) this.events.inc({ source, reason }, 0)
    }
  }

  /** Never throws: a metric must not be able to break what it is measuring. */
  record (source: EventSource, reason: EventReason, count = 1): void {
    try {
      this.events.inc({ source, reason }, count)
    } catch {
      // A counter that cannot count is not worth an exception on an error path.
    }
  }

  recordHttpError (status: number): void {
    try {
      this.httpErrors.inc({ status: String(status) })
    } catch { /* as above */ }
  }
}
