/** Injected so the sweeper's 24h and hourly windows are testable without waiting. */
export interface Clock {
  now: () => Date
}

export const CLOCK = Symbol('CLOCK')

export const systemClock: Clock = { now: () => new Date() }
