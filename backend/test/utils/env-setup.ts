import http from 'node:http'
import { randomUUID } from 'node:crypto'

import { inject } from 'vitest'

import { TEST_JWT_SECRET } from './constants'

// Node's default agent pools connections for 5s, and the run builds and tears down dozens
// of servers on ephemeral ports in one process. A pooled socket outliving its server, on a
// port the next app then binds, surfaces as "socket hang up" on a request that never
// reached anything. supertest goes through this agent, so the pool is the thing to remove.
http.globalAgent = new http.Agent({ keepAlive: false })

// Runs before any test module import. AppModule's ConfigModule validates and
// bakes env when the module file is imported (and ignores backend/.env under
// vitest), so the variables must exist here, not in createTestApp. One
// database per test process, on the run's shared mongod.
process.env.JWT_SECRET = TEST_JWT_SECRET
process.env.MONGODB_URI = `${inject('mongoUri')}sf-${randomUUID()}`
