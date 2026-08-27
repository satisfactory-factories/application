import { randomUUID } from 'node:crypto'

import { PROTOCOL_VERSION } from 'common'
import { inject } from 'vitest'
import { getConnectionToken } from '@nestjs/mongoose'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Connection } from 'mongoose'

import { configureApp } from '../../src/bootstrap'
import { AppModule } from '../../src/app.module'

export const TEST_JWT_SECRET = 'test-jwt-secret'
export const VERSION_HEADERS = { 'X-App-Version': PROTOCOL_VERSION }

export interface TestContext {
  app: INestApplication
}

/**
 * Env is set before the module is compiled: @nestjs/config never overwrites an
 * existing process.env value, so this wins over the committed backend/.env.
 * Each app gets its own database on the run's shared mongod.
 */
export const createTestApp = async (): Promise<TestContext> => {
  process.env.JWT_SECRET = TEST_JWT_SECRET
  process.env.MONGODB_URI = `${inject('mongoUri')}sf-${randomUUID()}`

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>()
  configureApp(app)
  await app.init()

  return { app }
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
