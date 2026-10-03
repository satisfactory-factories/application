import { CLOSE_CODES, PROTOCOL_VERSION } from 'common'
import { JwtService } from '@nestjs/jwt'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Connection } from 'mongoose'

import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, VERSION_HEADERS, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, registerAndLogin, resetRooms } from './utils/rooms'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

const PASSWORD = 'ficsit-forever'

describe('ws account token revocation', () => {
  let context: TestContext
  let connection: Connection
  let url: string
  let user: TestUser
  let clients: TestClient[]

  const changePassword = (token: string, newPassword: string) =>
    request(context.app.getHttpServer())
      .post('/me/password')
      .set(VERSION_HEADERS)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword })

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true })
    connection = await awaitConnection(context.app)
    url = context.wsUrl
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    clients = []
    wsConnectionLimiter.reset()
    await resetRooms(context.app)
    user = await registerAndLogin(context.app, 'planner')
  })

  afterEach(() => {
    closeAll(clients)
  })

  const open = async () => {
    const client = await TestClient.open(url)
    clients.push(client)
    return client
  }

  const greet = async (token?: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    return client
  }

  it('greets a token with no version claim against an account with no version field', async () => {
    await connection.collection('users')
      .updateOne({ username: user.username }, { $unset: { tokenVersion: '' } })
    const legacyToken = context.app.get(JwtService)
      .sign({ id: user.userId, username: user.username })

    const client = await open()
    client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, token: legacyToken })

    await expect(client.next('hello_ok')).resolves.toMatchObject({ userId: user.userId })
  })

  it('closes 4401 at hello for a token the account has superseded', async () => {
    await changePassword(user.token, 'brand-new')

    const client = await open()
    client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, token: user.token })

    await expect(client.waitForClose()).resolves.toMatchObject({
      code: CLOSE_CODES.unauthorized,
      reason: 'token revoked',
    })
  })

  it('greets the token the next sign-in mints', async () => {
    await changePassword(user.token, 'brand-new')
    const { body } = await request(context.app.getHttpServer())
      .post('/login').set(VERSION_HEADERS).send({ username: user.username, password: 'brand-new' })

    const client = await greet(body.token)

    expect(client.socket.readyState).toBe(1)
  })

  it('closes the account\'s live sockets when its password changes', async () => {
    const first = await greet(user.token)
    const second = await greet(user.token)

    await changePassword(user.token, 'brand-new')

    await expect(first.waitForClose()).resolves.toMatchObject({
      code: CLOSE_CODES.unauthorized,
    })
    await expect(second.waitForClose()).resolves.toMatchObject({
      code: CLOSE_CODES.unauthorized,
    })
  })

  it('leaves every other socket alone', async () => {
    const other = await registerAndLogin(context.app, 'someone-else')
    const theirs = await greet(other.token)
    const anonymous = await greet()

    await changePassword(user.token, 'brand-new')
    // The kick is synchronous with the write, so one round trip is enough to prove
    // it did not reach these two.
    await request(context.app.getHttpServer()).get('/health')

    expect(theirs.closeInfo).toBeNull()
    expect(anonymous.closeInfo).toBeNull()
  })
})
