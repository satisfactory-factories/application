import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'

import { AppModule } from './app.module'
import { configureApp } from './bootstrap'

// 3001 is the API's port everywhere: here, in the Dockerfile, in both compose
// files, and on the box where the Cloudflare tunnel points at it. Keep them
// equal — 618e944 moved this to 3010 without moving anything else, and the only
// reason production survived is that it was still running an older image.
//
// Overridable because web's vitest fixture server also binds 3001
// (web/testing/global-setup.ts). Nothing deployed sets it.
const PORT = Number(process.env.PORT) || 3001

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  configureApp(app)
  // Closes the HTTP server and the Mongo connection on SIGTERM/SIGINT, so a
  // `docker compose up` redeploy drops sockets cleanly instead of being killed.
  app.enableShutdownHooks()

  await app.listen(PORT)
  console.log(`Webserver running at http://localhost:${PORT}/`)
}

void bootstrap()
