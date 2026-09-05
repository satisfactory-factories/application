import { z } from 'zod'

/**
 * Every reason the planner may report, as a closed set.
 *
 * **This is an enum and not free text, and that is the whole security design.** `POST /events`
 * is unauthenticated, and a reason becomes a Prometheus label. A free-text label is unbounded
 * cardinality with no ceiling: anyone could mint a million series that Prometheus would then
 * keep for its whole retention. The pattern-and-fallback trick used for the version and commit
 * labels does not transfer, because those are shaped values and a reason has no shape to check.
 *
 * Adding a member here is the only way to add a label, which is deliberate: it is a decision
 * made in a reviewed diff rather than by whatever a client happens to send.
 */
export const EVENT_REASONS = [
  // --- Structural repairs made while loading a plan. Data was wrong and we corrected it. ---
  'plan_repair_duplicate_factory_id',
  'plan_repair_disposal_unreadable',
  'plan_repair_disposal_count_invalid',
  'plan_repair_duplicate_input_merged',
  'plan_repair_export_orphaned',
  'plan_repair_export_unrequested',
  'plan_repair_export_amount_mismatch',
  'plan_repair_import_export_missing',
  'plan_repair_import_amount_nonpositive',
  'plan_repair_import_orphaned',
  'plan_repair_import_self_reference',
  'plan_repair_product_entry_null',
  'plan_repair_product_amount_nonpositive',
  'plan_repair_part_entry_missing',

  // --- The app admitted defeat to the reader's face. An alert() they had to dismiss. ---
  // Included when the alert asks somebody to report something, or says data was lost,
  // corrupted or unreadable. Not included when it says what the user may not do: the task
  // limits and the waste-product guidance are the app working, not failing.
  'plan_repair_safe_mode_reset',
  'plan_validation_threw',
  'plan_import_invalid',
  'game_data_load_failed',
  'calc_dependency_error_alert',
  'calc_dependency_corrupt_alert',
  'calc_fix_product_missing',
  'calc_fix_generator_missing',
  'calc_power_recipe_missing',
  'share_load_invalid',
  'share_load_failed',

  // --- The client could not talk to the server, or gave up trying. ---
  'api_network_error',
  'sync_room_paused',
  // `stale` and `duplicate` op rejections are deliberately absent: they are the concurrency
  // control working as designed and happen constantly in ordinary two-person editing.
  'sync_op_reject_forbidden',
  'sync_op_reject_too_large',
  'sync_op_reject_invalid',
  'sync_op_reject_undeclared_bulk_removal',

  // --- Server side. Reported in process, never over this endpoint. ---
  'health_db_ping_failed',
  'room_sweep_failed',
  'slug_allocation_exhausted',
  'share_id_allocation_exhausted',
  'ws_handshake_internal_error',
  'ws_message_handler_error',
  /** A socket asked to be answered with a whole plan more often than any client needs to. */
  'ws_snapshot_reject_rate_exceeded',
  'room_access_unstable_race',
  'room_event_listener_threw',
  /** A revoked account's sockets were not closed, because the listener threw. */
  'account_event_listener_threw',
  // Each of these marks a place where the user's change committed and the record of it did
  // not. Today every one is a log line nobody reads.
  'post_commit_activity_lost',
  'post_commit_editor_stamp_lost',
  'post_commit_signin_stamp_lost',
  'post_commit_room_activity_lost',
  'post_commit_room_total_lost',
] as const

export type EventReason = typeof EVENT_REASONS[number]

/** Where a reason was raised. The label lets one panel separate the two halves. */
export const EVENT_SOURCES = ['client', 'server'] as const
export type EventSource = typeof EVENT_SOURCES[number]

export const EVENT_CAPS = {
  /**
   * The most a single reason may claim in one batch. A client reporting more than this in a
   * minute is looping, and the exact number stops mattering long before here.
   */
  count: 10_000,
  /** One entry per reason at most, so the enum itself is the real bound. */
  entries: EVENT_REASONS.length,
  /** The whole request body, in bytes. */
  bodyBytes: 8192,
  /** How often the client flushes, when it has anything to say. */
  flushIntervalMs: 60 * 1000,
} as const

const eventEntrySchema = z.strictObject({
  reason: z.enum(EVENT_REASONS),
  count: z.number().int().min(1).max(EVENT_CAPS.count),
})

/**
 * A batch of counts, posted to `POST /events`.
 *
 * Batched rather than one request per event, because one request per occurrence is a request
 * storm at exactly the moment something is already looping. It also carries no more identity
 * than the heartbeat does: the same anonymous instance id, and the build it is running.
 *
 * **Nothing here says what went wrong beyond the reason.** No message, no stack, no plan or
 * factory name, no ids of any kind. That is what makes it safe to send from an unauthenticated
 * endpoint, and it is why this does not replace real error tracking.
 */
export const eventReportSchema = z.strictObject({
  instanceId: z.uuid(),
  appVersion: z.string().min(1).max(32),
  gitSha: z.string().max(40).optional(),
  events: z.array(eventEntrySchema).min(1).max(EVENT_CAPS.entries),
})

export type EventReport = z.infer<typeof eventReportSchema>

export const parseEventReport = (input: unknown) => eventReportSchema.safeParse(input)

/** True when a value is a reason the server would accept. Used to bound the client buffer. */
export const isEventReason = (value: unknown): value is EventReason =>
  typeof value === 'string' && (EVENT_REASONS as readonly string[]).includes(value)
