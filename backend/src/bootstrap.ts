import type { NestExpressApplication } from '@nestjs/platform-express'

import { CORS_OPTIONS } from './config/cors'

/** Everything the tests need applied too, so they exercise the real pipeline. */
export const configureApp = (app: NestExpressApplication): NestExpressApplication => {
  app.set('trust proxy', 1) // One hop: the Cloudflare tunnel.
  // Fixes #172 413 Payload Too Large errors
  app.useBodyParser('json', { limit: '20mb' })
  app.useBodyParser('urlencoded', { limit: '20mb', extended: true })
  app.enableCors(CORS_OPTIONS)
  return app
}
