// test/global-setup.ts

// Construct the absolute path to your JSON file.
// Adjust the relative path as needed based on the location of this file.
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
  // Start an HTTP server that listens on a known port (e.g. 3001)
  await new Promise<void>((resolve, reject) => {
    server = http.createServer((req, res) => {
      if (req.url === '/gameData.json') {
        res.setHeader('Content-Type', 'application/json')
        res.end(gameData)
      } else {
        res.statusCode = 404
        res.end()
      }
    }).listen(3001, (err?: Error) => {
      if (err) return reject(err)
      console.log('Test server started on port 3001')
      resolve()
    })
  })

  // Attach the server instance to a global variable for cleanup in global-teardown
  ;(global as any).__TEST_SERVER__ = server
}
