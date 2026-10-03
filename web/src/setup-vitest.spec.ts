import { describe, expect, it, vi } from 'vitest'
import { config } from '@/config/config'
import { SyncSocket } from '@/sync/ws-client'

/**
 * The guarantees `setup-vitest.ts` installs, rather than the app code that leans on them.
 * They are invisible when they hold and expensive when they stop: a unit run that reaches the
 * live API fails on whatever the network did that minute, and it fails with every test passing,
 * because what breaks is thrown outside the tests entirely. Nothing else in the suite would
 * notice these being deleted.
 */
describe('the unit test environment', () => {
  describe('the API URL', () => {
    it('is a port on this machine, so nothing can travel', () => {
      expect(config.apiUrl).toBe('http://127.0.0.1:1')
    })

    it('is not the live API, whatever else it becomes', () => {
      expect(config.apiUrl).not.toContain('satisfactory-factories.app')
    })
  })

  describe('fetch', () => {
    /** The refusal announces itself on stderr; silence it here rather than in the reporter. */
    const captureStderr = () => vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    it('refuses the request instead of making it', async () => {
      const stderr = captureStderr()
      try {
        await expect(fetch('http://127.0.0.1:1/rooms')).rejects.toThrow(/tried to reach the network/)
      } finally {
        stderr.mockRestore()
      }
    })

    it('says on stderr what to mock, because the caller may swallow the rejection', async () => {
      const stderr = captureStderr()
      try {
        await fetch('http://127.0.0.1:1/telemetry').catch(() => {})
        expect(stderr).toHaveBeenCalledOnce()
        expect(stderr.mock.calls[0][0]).toContain('@/api/client')
      } finally {
        stderr.mockRestore()
      }
    })

    it('says it once per URL, so a retrying caller cannot bury the run in it', async () => {
      const stderr = captureStderr()
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          await fetch('http://127.0.0.1:1/rooms/retried').catch(() => {})
        }
        expect(stderr).toHaveBeenCalledOnce()
      } finally {
        stderr.mockRestore()
      }
    })
  })

  describe('WebSocket', () => {
    it('leaves a socket the sync client opens unconnected', async () => {
      const client = new SyncSocket()
      client.connect()

      // Long enough that a real socket to a live API would have handshaken.
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(client.status).toBe('connecting')
      expect(client.isConnected).toBe(false)
      client.stop()
    })

    it('never hands a handler an event, so no realm mismatch can reach the run', async () => {
      const socket = new WebSocket('wss://example.invalid/ws') as unknown as Record<string, unknown>
      const fired: string[] = []
      for (const handler of ['onopen', 'onmessage', 'onclose', 'onerror'] as const) {
        socket[handler] = () => fired.push(handler)
      }

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(fired).toEqual([])
      expect(socket.readyState).toBe(0)
    })
  })
})
