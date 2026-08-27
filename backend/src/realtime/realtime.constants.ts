/** The gateway shares the API's HTTP server; this is the only path it answers on. */
export const WS_PATH = '/ws'

/**
 * A whole-plan snapshot is the largest thing on the wire and the REST body limit
 * is 20mb, so the socket is given a little more headroom than the JSON parser.
 */
export const WS_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024

/** A socket that has not said `hello` by then is closed 4401. */
export const WS_HELLO_TIMEOUT_MS = 5_000

/** Server-driven ping/pong: two silent rounds and the socket is terminated. */
export const WS_HEARTBEAT_INTERVAL_MS = 30_000

/** A client that cannot drain this much is dropped rather than buffered forever. */
export const WS_MAX_BUFFERED_BYTES = 32 * 1024 * 1024

export const WS_CONNECTION_LIMIT = 60
export const WS_CONNECTION_WINDOW_MS = 60_000

export const WS_MESSAGE_LIMIT = 120
export const WS_MESSAGE_WINDOW_MS = 10_000

// RFC 6455 codes we send. 4xxx codes live in `common`'s CLOSE_CODES.
export const WS_POLICY_VIOLATION = 1008
export const WS_INTERNAL_ERROR = 1011
export const WS_TRY_AGAIN_LATER = 1013
