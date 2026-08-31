import { APP_VERSION_HEADER, PROTOCOL_VERSION } from 'common'
import type {
  AdoptRoomBody,
  CreateRoomBody,
  DeleteRoomResult,
  EnsureRoomResult,
  FactoryTab,
  JoinRoomResult,
  LeaveRoomResult,
  LegacyImportResult,
  LoginResponse,
  MessageResponse,
  PreferencesState,
  RoomAuthResult,
  RoomEnvelope,
  RoomListResponse,
  RoomPasswordResult,
  RoomSlugLookup,
  ShareCreatedResponse,
  ShareResponse,
  SyncedPreferences,
  ValidateTokenResponse,
  VersionMismatchBody,
} from 'common'
import { config } from '@/config/config'
import eventBus from '@/utils/eventBus'

/** 426 Upgrade Required: the version gate. */
export const UPGRADE_REQUIRED = 426

/** A response arrived and it wasn't a success. `body` is the parsed JSON, if any. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor (status: number, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }

  /** The server's machine-readable reason, e.g. `slug_taken`. */
  get code (): string | null {
    const code = (this.body as { code?: unknown } | null)?.code
    return typeof code === 'string' ? code : null
  }
}

/** The request never reached a response: offline, DNS, CORS, aborted. */
export class ApiNetworkError extends Error {
  readonly cause: unknown

  constructor (message: string, cause: unknown = null) {
    super(message)
    this.name = 'ApiNetworkError'
    this.cause = cause
  }
}

/** The version gate rejected us. The refresh prompt is driven off the event, not this. */
export class VersionMismatchError extends ApiError {
  readonly requiredVersion: string | null
  readonly receivedVersion: string | null

  constructor (body: VersionMismatchBody | null) {
    super(UPGRADE_REQUIRED, body?.message ?? 'This version of the planner is out of date.', body)
    this.name = 'VersionMismatchError'
    this.requiredVersion = body?.requiredVersion ?? null
    this.receivedVersion = body?.receivedVersion ?? null
  }
}

type TokenProvider = () => string | null

// localStorage rather than nothing, so a request issued before the auth store is
// instantiated still authenticates. The store overrides this with its own state.
const localStorageToken: TokenProvider = () => localStorage.getItem('token')
let tokenProvider: TokenProvider = localStorageToken

export const setApiTokenProvider = (provider: TokenProvider): void => {
  tokenProvider = provider
}

export const resetApiTokenProvider = (): void => {
  tokenProvider = localStorageToken
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** Attach the bearer token when one is available. Default true. */
  auth?: boolean
  /** An explicit token, for calls made before the store holds one. */
  token?: string
  signal?: AbortSignal
}

const buildHeaders = (options: RequestOptions): Record<string, string> => {
  // Every route but /health and GET /share/:id 426s without this header.
  const headers: Record<string, string> = { [APP_VERSION_HEADER]: PROTOCOL_VERSION }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const token = options.token ?? (options.auth === false ? null : tokenProvider())
  if (token) headers.Authorization = `Bearer ${token}`

  return headers
}

const readBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204 || typeof response.json !== 'function') return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

const messageOf = (body: unknown, status: number): string => {
  const message = (body as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : `Request failed with status ${status}`
}

const asVersionMismatchBody = (body: unknown): VersionMismatchBody | null => {
  const candidate = body as Partial<VersionMismatchBody> | null
  return candidate?.code === 'version_mismatch' ? candidate as VersionMismatchBody : null
}

export const apiRequest = async <T> (path: string, options: RequestOptions = {}): Promise<T> => {
  const method = options.method ?? 'GET'

  let response: Response
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: buildHeaders(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new ApiNetworkError(`${method} ${path} could not reach the server: ${reason}`, cause)
  }

  if (!response) throw new ApiNetworkError(`${method} ${path} produced no response`)

  const body = await readBody(response)

  if (response.status === UPGRADE_REQUIRED) {
    const detail = asVersionMismatchBody(body)
    eventBus.emit('versionMismatch', { source: 'rest', body: detail ?? undefined })
    throw new VersionMismatchError(detail)
  }

  if (!response.ok) throw new ApiError(response.status, messageOf(body, response.status), body)

  return body as T
}

// ===== Health =====

/** The shape `/health` has always served; uptime monitoring reads it too. */
export interface HealthResponse {
  status: 'ok' | 'fail'
  uptime: number
  database: { status: 'ok' | 'fail', state: string, responseTime: number, error?: string }
}

/** Exempt from the version gate by design, so an out-of-date tab can still ask. */
export const getHealth = (signal?: AbortSignal): Promise<HealthResponse> =>
  apiRequest('/health', { auth: false, signal })

// ===== Auth =====

export const register = (username: string, password: string): Promise<MessageResponse> =>
  apiRequest('/register', { method: 'POST', body: { username, password }, auth: false })

export const login = (username: string, password: string): Promise<LoginResponse> =>
  apiRequest('/login', { method: 'POST', body: { username, password }, auth: false })

/** The token rides in both the body and the header; the route reads the body. */
export const validateToken = (token: string): Promise<ValidateTokenResponse> =>
  apiRequest('/validate-token', { method: 'POST', body: { token }, token })

export const changePassword = (
  currentPassword: string,
  newPassword: string,
): Promise<MessageResponse> =>
  apiRequest('/me/password', { method: 'POST', body: { currentPassword, newPassword } })

// ===== Rooms =====

export const listRooms = (): Promise<RoomListResponse> => apiRequest('/rooms')

export const createRoom = (body: CreateRoomBody): Promise<EnsureRoomResult> =>
  apiRequest('/rooms', { method: 'POST', body })

export const adoptRoom = (body: AdoptRoomBody): Promise<EnsureRoomResult> =>
  apiRequest('/rooms/adopt', { method: 'POST', body })

export const reorderRooms = (roomIds: string[]): Promise<RoomListResponse> =>
  apiRequest('/rooms/order', { method: 'PUT', body: { roomIds } })

export const renameRoom = (roomId: string, name: string): Promise<RoomEnvelope> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}/name`, { method: 'PUT', body: { name } })

export const shareRoom = (roomId: string, slug?: string): Promise<RoomEnvelope> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}/share`, { method: 'POST', body: { slug } })

export const unshareRoom = (roomId: string): Promise<RoomEnvelope> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}/unshare`, { method: 'POST', body: {} })

export const setRoomPassword = (roomId: string, password: string): Promise<RoomPasswordResult> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}/password`, { method: 'PUT', body: { password } })

export const removeRoomPassword = (roomId: string): Promise<RoomPasswordResult> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}/password`, { method: 'DELETE' })

/** Exchanges an invite password for a visitor token. No account needed. */
export const authenticateRoom = (roomId: string, password: string): Promise<RoomAuthResult> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}/auth`, {
    method: 'POST',
    body: { password },
    auth: false,
  })

export const joinRoom = (roomId: string, visitorToken?: string): Promise<JoinRoomResult> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: { visitorToken } })

export const leaveRoom = (roomId: string): Promise<LeaveRoomResult> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST', body: {} })

export const deleteRoom = (roomId: string): Promise<DeleteRoomResult> =>
  apiRequest(`/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' })

/** Internal lookup behind the user-facing `/room/<slug>` page. */
export const lookupRoomBySlug = (slug: string): Promise<RoomSlugLookup> =>
  apiRequest(`/rooms/by-slug/${encodeURIComponent(slug.toLowerCase())}`, { auth: false })

export const legacyAutoImport = (localTabCount: number): Promise<LegacyImportResult> =>
  apiRequest('/rooms/legacy/auto-import', { method: 'POST', body: { localTabCount } })

// ===== Preferences =====

export const getPreferences = (): Promise<PreferencesState> => apiRequest('/preferences')

/** A stale `baseRevision` returns 409 carrying the current state, never a silent overwrite. */
export const savePreferences = (
  prefs: SyncedPreferences,
  baseRevision: number,
): Promise<PreferencesState> =>
  apiRequest('/preferences', { method: 'PUT', body: { prefs, baseRevision } })

// ===== Snapshot share links =====

export const createSnapshotShare = (tab: FactoryTab): Promise<ShareCreatedResponse> =>
  apiRequest('/share', { method: 'POST', body: tab })

export const getSnapshotShare = (shareId: string): Promise<ShareResponse> =>
  apiRequest(`/share/${encodeURIComponent(shareId)}`, { auth: false })
