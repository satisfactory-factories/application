// test/global-setup.ts
import path from 'path'
import * as fs from 'node:fs'
import * as http from 'node:http'

const dataFilePath = path.join(__dirname, '../public/gameData_v1.0-28.json')
let gameData: string

try {
  // Read the JSON file as a UTF-8 string
  gameData = fs.readFileSync(dataFilePath, { encoding: 'utf-8' })
  console.log(`Loaded game data from ${dataFilePath}`)
} catch (err) {
  console.error(`Error reading game data file at ${dataFilePath}:`, err)
  throw err
}

let server: http.Server

export default async function globalSetup () {
  // If server is already running, skip starting a new one
  // Start an HTTP server that listens on port 3001
  await new Promise<void>(resolve => {
    server = http.createServer((req, res) => {
      if (req.url === '/gameData.json') {
        res.setHeader('Content-Type', 'application/json')
        res.end(gameData)
      } else {
        res.statusCode = 404
        res.end()
      }
    })
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log('Port 3001 already in use, skipping test server startup')
        resolve()
      }
    })
    server.listen(3001, () => {
      console.log('Test server started on port 3001')
      resolve()
    })
  });
  // Store for teardown
  (global as any).__TEST_SERVER__ = server
}
