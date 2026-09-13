import { TELEMETRY_CAPS } from 'common'
import { defineStore } from 'pinia'
import type { TelemetryHeartbeat } from 'common'
import { config } from '@/config/config'
import { sendTelemetryHeartbeat } from '@/api/client'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'

/** Where the anonymous instance id lives. Nothing else may be kept under this key. */
export const TELEMETRY_INSTANCE_KEY = 'telemetryInstanceId'

/**
 * When somebody last touched any tab of this browser, as a timestamp. Every tab shares the
 * instance id, and the server keeps whichever tab's heartbeat lands first, so a background
 * tab must know about the foreground one's clicks or it reports the whole browser idle.
 */
export const TELEMETRY_INTERACTION_KEY = 'telemetryLastInteractionAt'

/** Wheel events arrive by the hundred; storage is written at most this often. */
const INTERACTION_WRITE_INTERVAL_MS = 5_000

/** What the server counts a client under when the build has no version to report. */
export const UNKNOWN_VERSION = 'unknown'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What counts as somebody being at the page. Passive: nothing here may slow the input down. */
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * `crypto.randomUUID` needs a secure context, which a page served over plain http on a
 * LAN is not. The fallback is the same v4 shape from the same CSPRNG.
 */
const mintUuid = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0F) | 0x40
  bytes[8] = (bytes[8] & 0x3F) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The anonymous instance id.
 *
 * **It is random, and it is never derived from the account.** Not hashed from a username,
 * not seeded from an account id, not taken from a token, not stored anywhere near one. It
 * says "this browser profile" and nothing else: it is minted before anybody signs in, it
 * is untouched by signing in or out, and clearing site data mints a fresh one that cannot
 * be tied to the old. Changing any of that changes what `docs/telemetry.md` promises.
 *
 * A stored value that is not a UUID is replaced rather than sent, so a hand-edited or
 * half-written key cannot become a label the server has to deal with.
 */
export const readInstanceId = (): string => {
  try {
    const stored = localStorage.getItem(TELEMETRY_INSTANCE_KEY)
    if (stored !== null && UUID_PATTERN.test(stored)) return stored

    const minted = mintUuid()
    localStorage.setItem(TELEMETRY_INSTANCE_KEY, minted)
    return minted
  } catch {
    // Private browsing can refuse localStorage outright. A per-session id still counts
    // the browser; it just stops recognising it after a reload.
    return mintUuid()
  }
}

/**
 * The anonymous usage heartbeat, sent on load and every five minutes after.
 *
 * It exists because the server cannot see most of what the planner is used for. A local
 * tab never reaches it, a signed-out user never reaches it, and those are the majority.
 * What goes in the payload is fixed by `telemetryHeartbeatSchema` in `common` and written
 * out in `docs/telemetry.md`; it is counts, two flags and a version, and nothing else may
 * join them. The idle flag is the only thing that watches input, and all it keeps is the
 * time of the last one.
 *
 * Two rules it must keep. Offline mode means total backend silence, so nothing is sent
 * while it is on. And a heartbeat is worth nothing, so a failure is swallowed whole
 * rather than logged — there is no outcome a reader could act on and no reason to put one
 * in front of them.
 */
export const useTelemetryStore = defineStore('telemetry', () => {
  const appStore = useAppStore()
  const authStore = useAuthStore()
  const roomSync = useRoomSyncStore()

  let instanceId: string | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  // Loading the page is an interaction, so a fresh tab is active until proven otherwise.
  let lastInteractionAt = Date.now()
  let lastInteractionWriteAt = 0

  const markInteraction = (): void => {
    lastInteractionAt = Date.now()
    if (lastInteractionAt - lastInteractionWriteAt < INTERACTION_WRITE_INTERVAL_MS) return
    lastInteractionWriteAt = lastInteractionAt
    try {
      localStorage.setItem(TELEMETRY_INTERACTION_KEY, String(lastInteractionAt))
    } catch {
      // Without storage each tab only knows its own touches, which is still an answer.
    }
  }

  /** The newest touch across every tab of this browser, falling back to this tab's own. */
  const lastBrowserInteractionAt = (): number => {
    try {
      const shared = Number(localStorage.getItem(TELEMETRY_INTERACTION_KEY))
      return Number.isFinite(shared) ? Math.max(shared, lastInteractionAt) : lastInteractionAt
    } catch {
      return lastInteractionAt
    }
  }

  const isIdle = (): boolean => Date.now() - lastBrowserInteractionAt() >= TELEMETRY_CAPS.idleAfterMs

  // Resolved once and held: with localStorage unavailable, reading it per heartbeat would
  // mint a new id every time and report one browser as an endless parade of new ones.
  const resolveInstanceId = (): string => (instanceId ??= readInstanceId())

  const buildHeartbeat = (): TelemetryHeartbeat => {
    const tabs = appStore.getTabs()
    let localTabCount = 0
    let cloudTabCount = 0
    let factoriesTotal = 0

    for (const tab of tabs) {
      // 'synced' and 'joined' are both rooms on the server; only 'local' is not.
      if (appStore.getTabState(tab.id).kind === 'local') localTabCount++
      else cloudTabCount++
      factoriesTotal += tab.factories?.length ?? 0
    }

    return {
      instanceId: resolveInstanceId(),
      signedIn: authStore.isLoggedIn,
      tabCount: tabs.length,
      localTabCount,
      cloudTabCount,
      factoriesTotal,
      idle: isIdle(),
      appVersion: config.appVersion || UNKNOWN_VERSION,
      // Omitted rather than sent empty when the build knows no commit: the field is optional
      // and the server counts a missing one under `unknown` either way.
      ...(config.gitSha ? { gitSha: config.gitSha } : {}),
    }
  }

  const send = async (): Promise<void> => {
    if (roomSync.isSuppressed) return

    try {
      await sendTelemetryHeartbeat(buildHeartbeat())
    } catch {
      // Deliberately empty, and deliberately not a console.warn. Offline, an ad blocker
      // eating the request, DNS, a server that has never heard of the route: none of it
      // is the reader's problem, and a beacon that talks in the console is a bug report
      // waiting to be filed against nothing.
    }
  }

  const start = (): void => {
    if (timer !== undefined) return

    lastInteractionWriteAt = 0
    markInteraction()
    for (const event of INTERACTION_EVENTS) window.addEventListener(event, markInteraction, { passive: true })

    void send()
    timer = setInterval(() => void send(), TELEMETRY_CAPS.intervalMs)
    // A browser timer holds nothing open, a Node one holds the process open. Under vitest
    // and any SSR pass this is the latter, so let go of it where the method exists.
    ;(timer as { unref?: () => void }).unref?.()
  }

  const stop = (): void => {
    clearInterval(timer)
    timer = undefined
    for (const event of INTERACTION_EVENTS) window.removeEventListener(event, markInteraction)
  }

  return {
    buildHeartbeat,
    send,
    start,
    stop,
    dispose: stop,
  }
})
