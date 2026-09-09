/**
 * The largest frame a client has any business sending: a room-cap plan of 150 factories,
 * every one of them as big as the biggest factory a real plan holds (~15KB), is around
 * 2.2MB. Doubling that is the headroom; anything past it is not a plan.
 * `ws-limits.spec.ts` measures a room-cap op against this.
 */
export const WS_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024

/** A socket that has not said `hello` by then is closed 4401. */
export const WS_HELLO_TIMEOUT_MS = 5_000

/** Server-driven ping/pong: two silent rounds and the socket is terminated. */
export const WS_HEARTBEAT_INTERVAL_MS = 30_000

/**
 * Field locks expire after `FIELD_LOCK_TTL_MS` (10s), so sweeping them on the 30s
 * heartbeat left a field showing as held for up to three times its own lifetime.
 */
export const WS_LOCK_SWEEP_INTERVAL_MS = 5_000

/** A client that cannot drain this much is dropped rather than buffered forever. */
export const WS_MAX_BUFFERED_BYTES = 32 * 1024 * 1024

export const WS_CONNECTION_LIMIT = 60
export const WS_CONNECTION_WINDOW_MS = 60_000

/**
 * Sockets held open at once, which the connection *rate* limit says nothing about: 60 a
 * minute, every minute, was an unbounded number of live sockets. One browser holds a
 * single socket however many tabs it syncs, so an address may hold as many as it is
 * already allowed to open in a window and no more.
 */
export const WS_MAX_SOCKETS_PER_IP = WS_CONNECTION_LIMIT
/** The process-wide ceiling. Each socket costs a slot in three indexes and a send buffer. */
export const WS_MAX_SOCKETS = 2_000

export const WS_MESSAGE_LIMIT = 120
export const WS_MESSAGE_WINDOW_MS = 10_000

/**
 * Rejections that answer with a whole plan: a stale base, and an op the schema refused.
 * Each costs a full document read and a serialisation, off a frame that can be 90 bytes,
 * so they get a budget of their own well under the message limit. A client rebases at
 * most a couple of times per room per reconnect and may hold 25 rooms, so a socket has no
 * legitimate reason to want more than one a second sustained.
 */
export const WS_SNAPSHOT_REJECT_LIMIT = 60
export const WS_SNAPSHOT_REJECT_WINDOW_MS = 60_000

// RFC 6455 codes we send. 4xxx codes live in `common`'s CLOSE_CODES.
export const WS_POLICY_VIOLATION = 1008
export const WS_INTERNAL_ERROR = 1011
export const WS_TRY_AGAIN_LATER = 1013
