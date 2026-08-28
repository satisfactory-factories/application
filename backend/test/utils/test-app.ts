import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { PROTOCOL_VERSION, WS_PATH } from 'common'
import { ThrottlerStorage } from '@nestjs/throttler'
import { inject } from 'vitest'
import { getConnectionToken } from '@nestjs/mongoose'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Connection } from 'mongoose'

import { CLOCK, Clock } from '../../src/rooms/clock'
import { EnsureStepRunner } from '../../src/rooms/ensure-step.runner'
import { configureApp } from '../../src/bootstrap'
import { AppModule } from '../../src/app.module'

export const TEST_JWT_SECRET = 'test-jwt-secret'
export const VERSION_HEADERS = { 'X-App-Version': PROTOCOL_VERSION }

export interface TestContext {
  app: INestApplication
  /** The gateway's URL on the app's own port; every app listens. */
  wsUrl: string
}

export interface TestAppOptions {
  /** Replaces the ensure-step seam, so a chain can be failed at a named step. */
  stepRunner?: EnsureStepRunner
  clock?: Clock
  /**
   * Suites that make hundreds of calls from one address would otherwise trip the
   * 200-per-5-minutes global bucket. health.spec asserts the real thing.
   */
  unthrottled?: boolean
}

const NEVER_THROTTLED: ThrottlerStorage = {
  increment: async (_key, ttl) =>
    ({ totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 }),
}

/**
 * Env is set before the module is compiled, and each app gets its own database on
 * the run's shared mongod. Caveat: ConfigService answers from the parsed .env
 * before process.env, so a variable that backend/.env also defines keeps the
 * file's value. Never assert on TEST_JWT_SECRET; verify through JwtService.
 */
export const createTestApp = async (options: TestAppOptions = {}): Promise<TestContext> => {
  process.env.JWT_SECRET = TEST_JWT_SECRET
  process.env.MONGODB_URI = `${inject('mongoUri')}sf-${randomUUID()}`

  const builder = Test.createTestingModule({ imports: [AppModule] })
  if (options.stepRunner) builder.overrideProvider(EnsureStepRunner).useValue(options.stepRunner)
  if (options.clock) builder.overrideProvider(CLOCK).useValue(options.clock)
  if (options.unthrottled) builder.overrideProvider(ThrottlerStorage).useValue(NEVER_THROTTLED)

  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>()
  configureApp(app)
  await app.init()
  // The connection is lazy; resolving it here keeps DB assertions stable.
  await awaitConnection(app)

  // Every app binds a port for the whole file. supertest otherwise listens and
  // closes the server around each request, and that churn intermittently landed a
  // reply on a torn-down socket ("Parse Error: Expected HTTP/") or timed out.
  await app.listen(0)
  const address = (app.getHttpServer() as Server).address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  return { app, wsUrl: `ws://127.0.0.1:${port}${WS_PATH}` }
}

export const destroyTestApp = async ({ app }: TestContext): Promise<void> => {
  await app.close()
}

/** Waits for the lazily-created connection so DB-backed assertions are stable. */
export const awaitConnection = async (app: INestApplication): Promise<Connection> => {
  const connection = app.get<Connection>(getConnectionToken())
  if (connection.readyState !== 1) await connection.asPromise()
  return connection
}
