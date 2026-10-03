import { SetMetadata } from '@nestjs/common'

export const SKIP_VERSION_GATE = 'skipVersionGate'

/**
 * The only way past the version gate. Reserved for routes a pre-v7 client still
 * legitimately calls: the uptime monitor's /health and shared plan links.
 */
export const SkipVersionGate = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_VERSION_GATE, true)
