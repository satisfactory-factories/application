// test/global-setup.ts
import path from 'path'
import * as fs from 'node:fs'
import * as http from 'node:http'

import { config } from '../src/config/config'

const dataFilePath = path.join(__dirname, `../public/gameData_v${config.dataVersion}.json`)
let gameData: string

try {
  // Read the JSON file as a UTF-8 string
  gameData = fs.readFileSync(dataFilePath, { encoding: 'utf-8' })
  console.log(`Loaded game data from ${dataFilePath}`)
} catch (err) {
  console.error(`Error reading game data file at ${dataFilePath}:`, err)
  throw err
}

// Vitest takes the teardown from what globalSetup returns (or from a named `teardown`
// export) — there is no `globalTeardown` config option, that one is Jest's. Returning
// the closer here is what guarantees this listener actually goes away: while it is
// open, its handle keeps the main process alive, Vitest's close() blows its 10s
// teardown budget, and the run exits non-zero at random even though every test passed.
export default async function globalSetup () {
  const server = http.createServer((req, res) => {
    if (req.url === '/gameData.json') {
      res.setHeader('Content-Type', 'application/json')
      res.end(gameData)
    } else {
      res.statusCode = 404
      res.end()
    }
  })

  const listening = await new Promise<boolean>(resolve => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log('Port 3001 already in use, skipping test server startup')
        resolve(false)
      }
    })
    server.listen(3001, () => {
      console.log('Test server started on port 3001')
      resolve(true)
    })
  })

  // Nothing of ours is listening, so there is nothing to close — and calling close()
  // on a server that never listened fails with ERR_SERVER_NOT_RUNNING.
  if (!listening) return

  return async () => {
    // close() stops new connections but waits on live ones, so a lingering keep-alive
    // socket would reintroduce the same hang. Drop them first.
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })
    console.log('Test server closed')
  }
}
