import request from 'supertest'
import type { INestApplication } from '@nestjs/common'

import { METRICS_TOKEN_VAR } from '../../src/metrics/metrics.constants'

/** The token the metrics suites configure. Any non-empty string would do. */
export const METRICS_TOKEN = 'a-metrics-token-for-the-suite'

export const useMetricsToken = (): void => {
  process.env[METRICS_TOKEN_VAR] = METRICS_TOKEN
}

export const clearMetricsToken = (): void => {
  delete process.env[METRICS_TOKEN_VAR]
}

export const scrapeMetrics = (app: INestApplication) =>
  request(app.getHttpServer()).get('/metrics').set('Authorization', `Bearer ${METRICS_TOKEN}`)

/**
 * Reads one sample out of the text exposition format, by exact series name. Undefined
 * when the series is absent, which is a different thing from it being zero — a gauge that
 * was never set has no line at all.
 */
export const sample = (body: string, name: string, labels?: string): number | undefined => {
  const key = labels === undefined ? name : `${name}{${labels}}`
  const line = body.split('\n').find(candidate => candidate.startsWith(`${key} `))
  return line === undefined ? undefined : Number(line.slice(key.length + 1))
}

/**
 * The sum of every series of a metric carrying all of the given labels, whatever else they
 * carry. Undefined when none does. For a counter with more labels than the assertion cares
 * about, where `sample` would need every label spelled out in registry order.
 */
export const sampleWhere = (body: string, name: string, labels: string): number | undefined => {
  const wanted = labels.split(',')
  const matching = body.split('\n').filter(line => {
    const open = line.indexOf('{'); const close = line.indexOf('}')
    if (!line.startsWith(`${name}{`) || close < 0) return false
    const present = line.slice(open + 1, close).split(',')
    return wanted.every(pair => present.includes(pair))
  })
  if (matching.length === 0) return undefined
  return matching.reduce((sum, line) => sum + Number(line.slice(line.indexOf('}') + 2)), 0)
}

/** Every label value present on a metric, in the order the registry emitted them. */
export const labelValues = (body: string, name: string, label: string): string[] => {
  const pattern = new RegExp(`^${name}\\{[^}]*\\b${label}="([^"]*)"`)
  return body.split('\n')
    .map(line => pattern.exec(line)?.[1])
    .filter((value): value is string => value !== undefined)
}
