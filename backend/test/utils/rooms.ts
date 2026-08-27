import { getModelToken } from '@nestjs/mongoose'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import type { Model } from 'mongoose'

import { EnsureStep, EnsureStepRunner } from '../../src/rooms/ensure-step.runner'
import { Room } from '../../src/rooms/schemas/room.schema'
import { RoomActivity } from '../../src/rooms/schemas/room-activity.schema'
import { RoomMembership } from '../../src/rooms/schemas/room-membership.schema'
import { User } from '../../src/auth/user.schema'
import { UserPreferences } from '../../src/preferences/user-preferences.schema'
import { VERSION_HEADERS } from './test-app'

export interface TestUser {
  username: string
  userId: string
  token: string
}

const ROOM_COLLECTIONS = ['rooms', 'room_memberships', 'room_activity', 'user_preferences']

type Method = 'get' | 'post' | 'put' | 'delete'

/** Every room call carries the version header; the `as` user's bearer when given. */
export const call = (app: INestApplication, method: Method, path: string, as?: TestUser) => {
  const req = request(app.getHttpServer())[method](path).set(VERSION_HEADERS)
  return as ? req.set('Authorization', `Bearer ${as.token}`) : req
}

export const registerAndLogin = async (
  app: INestApplication,
  username: string,
): Promise<TestUser> => {
  const password = 'ficsit-forever'
  await call(app, 'post', '/register').send({ username, password })
  const { body } = await call(app, 'post', '/login').send({ username, password })
  const payload = jwt.decode(body.token) as { id: string }

  return { username, userId: payload.id, token: body.token }
}

/**
 * The ensure-step chains lean on duplicate-key errors, so the unique indexes have
 * to exist before any concurrency assertion means anything. autoIndex builds them
 * in the background otherwise.
 */
export const buildIndexes = async (app: INestApplication): Promise<void> => {
  const names = [Room.name, RoomMembership.name, RoomActivity.name, User.name, UserPreferences.name]
  for (const name of names) {
    await app.get<Model<unknown>>(getModelToken(name)).syncIndexes()
  }
}

export const resetRooms = async (app: INestApplication): Promise<void> => {
  const model = app.get<Model<unknown>>(getModelToken(Room.name))
  for (const collection of ROOM_COLLECTIONS) {
    await model.db.collection(collection).deleteMany({})
  }
  await model.db.collection('users').deleteMany({})
  await model.db.collection('factorydatas').deleteMany({})
}

/** The seam: runs every step but the named one, which throws instead. */
export class FailingStepRunner extends EnsureStepRunner {
  failAt: EnsureStep | null = null
  /** Skips the first N matches, so a step used twice in a chain can be targeted. */
  skip = 0
  readonly ran: EnsureStep[] = []

  override async run<T> (step: EnsureStep, work: () => Promise<T>): Promise<T> {
    if (step === this.failAt) {
      if (this.skip > 0) this.skip -= 1
      else throw new Error(`injected failure at ${step}`)
    }
    this.ran.push(step)
    return work()
  }

  reset (): void {
    this.failAt = null
    this.skip = 0
    this.ran.length = 0
  }
}

/** Starts at the real now, so mongoose's own `createdAt` stamps stay comparable. */
export class FakeClock {
  private current = new Date()

  now (): Date {
    return new Date(this.current)
  }

  advance (ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }

  /** Back to real time; the sweeper cases each need their own window. */
  reset (): void {
    this.current = new Date()
  }
}
