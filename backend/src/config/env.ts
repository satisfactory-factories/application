/** Every variable the API refuses to boot without. */
export const REQUIRED_ENV_VARS = ['JWT_SECRET', 'MONGODB_URI'] as const

export interface Env extends Record<string, unknown> {
  JWT_SECRET: string
  MONGODB_URI: string
}

/**
 * ConfigModule's boot-time assertion. Throwing here kills the process before it
 * listens, which is the point: the old code fell back to the literal 'secret'
 * and would happily sign tokens anyone could forge.
 */
export const validateEnv = (raw: Record<string, unknown>): Env => {
  const missing = REQUIRED_ENV_VARS.filter(key => String(raw[key] ?? '').trim() === '')

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`)
  }

  return raw as Env
}
