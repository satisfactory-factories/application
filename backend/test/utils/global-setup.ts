import { MongoMemoryServer } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    mongoUri: string
  }
}

/**
 * One mongod for the whole run. A server per file raced for ports and starved
 * each other badly enough to time requests out.
 */
export default async function setup (project: TestProject): Promise<() => Promise<void>> {
  const mongo = await MongoMemoryServer.create()
  project.provide('mongoUri', mongo.getUri())

  return async () => {
    await mongo.stop()
  }
}
