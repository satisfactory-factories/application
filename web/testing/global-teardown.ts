export default async function globalTeardown () {
  const server = (global as any).__TEST_SERVER__
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
    console.log('Test server closed')
  }
}
