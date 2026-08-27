import { WsAdapter } from '@nestjs/platform-ws'
import type { NestExpressApplication } from '@nestjs/platform-express'

import { CORS_OPTIONS } from './config/cors'

/** Everything the tests need applied too, so they exercise the real pipeline. */
export const configureApp = (app: NestExpressApplication): NestExpressApplication => {
  app.set('trust proxy', 1) // One hop: the Cloudflare tunnel.
  // Fixes #172 413 Payload Too Large errors
  app.useBodyParser('json', { limit: '20mb' })
  app.useBodyParser('urlencoded', { limit: '20mb', extended: true })
  app.enableCors(CORS_OPTIONS)
  // Must be set before init(): a gateway with no adapter falls back to socket.io,
  // which is not installed. The raw server, so the ws server shares port 3001.
  app.useWebSocketAdapter(new WsAdapter(app.getHttpServer()))
  return app
}
