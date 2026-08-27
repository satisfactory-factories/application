import WebSocket from 'ws'
import { PROTOCOL_VERSION } from 'common'
import type { ClientMessage, ServerMessage, ServerMessageType } from 'common'

export interface CloseInfo {
  code: number
  reason: string
}

type OfType<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>

interface Waiter {
  types: ServerMessageType[]
  resolve: (message: ServerMessage) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const DEFAULT_TIMEOUT_MS = 5_000

/**
 * A real `ws` client with a per-type mailbox: `next('snapshot')` consumes the
 * first snapshot, so a test reads messages in the order it cares about without
 * depending on the order of the ones it does not.
 */
export class TestClient {
  readonly socket: WebSocket
  closeInfo: CloseInfo | null = null

  private readonly queue: ServerMessage[] = []
  private readonly waiters: Waiter[] = []
  private readonly closeWaiters: Array<(info: CloseInfo) => void> = []

  constructor (url: string, options: WebSocket.ClientOptions = {}) {
    this.socket = new WebSocket(url, options)
    // A permanent listener: an unheard 'error' would take the whole run down.
    this.socket.on('error', () => undefined)
    this.socket.on('message', raw => this.receive(raw))
    this.socket.on('close', (code, reason) => this.onClose(code, reason.toString()))
  }

  static async open (url: string, options: WebSocket.ClientOptions = {}): Promise<TestClient> {
    const client = new TestClient(url, options)
    await client.opened()
    return client
  }

  /** Opens, says hello and waits for `hello_ok`; the start of nearly every test. */
  static async greet (url: string, token?: string): Promise<TestClient> {
    const client = await TestClient.open(url)
    client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, token })
    await client.next('hello_ok')
    return client
  }

  opened (): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve()
    return new Promise((resolve, reject) => {
      this.socket.once('open', () => resolve())
      this.socket.once('error', reject)
    })
  }

  send (message: ClientMessage): void {
    this.socket.send(JSON.stringify(message))
  }

  /** Bypasses the typed union, for the malformed-payload cases. */
  sendRaw (payload: unknown): void {
    this.socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
  }

  next<T extends ServerMessageType> (type: T, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<OfType<T>> {
    return this.nextOneOf([type], timeoutMs)
  }

  /** One waiter over several types, for the "ack or reject, whichever comes" races. */
  nextOneOf<T extends ServerMessageType> (
    types: T[],
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<OfType<T>> {
    const index = this.queue.findIndex(message => types.includes(message.type as T))
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0] as OfType<T>)

    return new Promise<OfType<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.drop(timer)
        reject(new Error(`timed out waiting for "${types.join('|')}"; queued: [${this.seen()}]`))
      }, timeoutMs)
      this.waiters.push({
        types,
        resolve: message => resolve(message as OfType<T>),
        reject,
        timer,
      })
    })
  }

  waitForClose (timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CloseInfo> {
    if (this.closeInfo) return Promise.resolve(this.closeInfo)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs)
      this.closeWaiters.push(info => {
        clearTimeout(timer)
        resolve(info)
      })
    })
  }

  /** Asserts nothing of `type` arrives within the window. */
  async expectSilence (type: ServerMessageType, ms = 300): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
    const found = this.queue.find(message => message.type === type)
    if (found) throw new Error(`unexpected "${type}": ${JSON.stringify(found)}`)
  }

  seen (): string {
    return this.queue.map(message => message.type).join(', ')
  }

  close (): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close()
    else this.socket.terminate()
  }

  private receive (raw: WebSocket.RawData): void {
    const message = JSON.parse(raw.toString()) as ServerMessage
    const index = this.waiters.findIndex(waiter => waiter.types.includes(message.type))
    if (index < 0) {
      this.queue.push(message)
      return
    }

    const [waiter] = this.waiters.splice(index, 1)
    clearTimeout(waiter.timer)
    waiter.resolve(message)
  }

  private onClose (code: number, reason: string): void {
    this.closeInfo = { code, reason }
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error(`socket closed ${code} while waiting for "${waiter.types.join('|')}"`))
    }
    for (const resolve of this.closeWaiters.splice(0)) resolve(this.closeInfo)
  }

  private drop (timer: NodeJS.Timeout): void {
    const index = this.waiters.findIndex(waiter => waiter.timer === timer)
    if (index >= 0) this.waiters.splice(index, 1)
  }
}

/** Closes every client a test opened, ignoring the ones already gone. */
export const closeAll = (clients: TestClient[]): void => {
  for (const client of clients) client.close()
}
