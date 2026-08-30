import { randomUUID } from 'node:crypto'

import { inject } from 'vitest'

import { TEST_JWT_SECRET } from './constants'

// Runs before any test module import. AppModule's ConfigModule validates and
// bakes env when the module file is imported (and ignores backend/.env under
// vitest), so the variables must exist here, not in createTestApp. One
// database per test process, on the run's shared mongod.
process.env.JWT_SECRET = TEST_JWT_SECRET
process.env.MONGODB_URI = `${inject('mongoUri')}sf-${randomUUID()}`
