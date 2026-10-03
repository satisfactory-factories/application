import { Controller, Get, Res } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import mongoose, { Connection } from 'mongoose'
import type { Response } from 'express'

import { SkipVersionGate } from '../common/decorators/skip-version-gate.decorator'
import { EventCountersService } from '../event-counters/event-counters.service'

/**
 * How long /health waits on Mongo before calling it dead. Well under the 5s
 * Docker healthcheck timeout, and under any monitor's default.
 */
export const DB_PING_TIMEOUT_MS = 3000

export interface HealthResponse {
  status: 'ok' | 'fail'
  uptime: number
  database: {
    status: 'ok' | 'fail'
    state: string
    responseTime: number
    error?: string
  }
}

@Controller('health')
export class HealthController {
  constructor (
    @InjectConnection() private readonly connection: Connection,
    private readonly counters: EventCountersService,
  ) {}

  // 200 only if Mongo answers, 503 otherwise, so uptime monitoring sees a
  // database outage instead of a cheerful process. Shape is load-bearing:
  // updown.io and the container healthcheck both read it.
  @Get()
  @SkipVersionGate()
  async check (@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const startedAt = Date.now()
    let timer: NodeJS.Timeout | undefined
    let error: string | undefined

    try {
      const db = this.connection.db
      if (!db) throw new Error('No database handle')
      // ping is Mongo's SELECT 1. Raced because bufferCommands queues the
      // command for 10s when the connection is down — longer than any monitor
      // will wait, which would make a dead database look like a slow one.
      await Promise.race([
        db.admin().command({ ping: 1 }),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Timed out after ${DB_PING_TIMEOUT_MS}ms`)), DB_PING_TIMEOUT_MS)
        }),
      ])
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      console.error(`Health check failed: ${error}`)
      this.counters.record('server', 'health_db_ping_failed')
    } finally {
      clearTimeout(timer)
    }

    res.status(error ? 503 : 200)

    return {
      status: error ? 'fail' : 'ok',
      uptime: Math.round(process.uptime()),
      database: {
        status: error ? 'fail' : 'ok',
        state: mongoose.STATES[this.connection.readyState],
        responseTime: Date.now() - startedAt,
        ...(error ? { error } : {}),
      },
    }
  }
}
