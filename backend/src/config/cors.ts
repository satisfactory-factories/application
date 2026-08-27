import { APP_VERSION_HEADER } from 'common'
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'

/**
 * The origins the browser app is actually served from. The old list allowed the
 * API's own origin, which no browser ever sends, so every cross-origin call was
 * riding on the fact that nothing preflighted yet.
 */
export const WEB_ORIGINS = [
  'https://satisfactory-factories.app',
  'https://www.satisfactory-factories.app',
  'http://localhost:3000',
]

export const CORS_OPTIONS: CorsOptions = {
  origin: WEB_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // X-App-Version is a custom header, so every gated call now preflights.
  allowedHeaders: ['Content-Type', 'Authorization', APP_VERSION_HEADER],
}
