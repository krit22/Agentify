/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { app } from '../src/app.js'

// Mock database package
vi.mock('@repo/db', () => {
  const mockPrisma = {
    widgetConfig: {
      findUnique: vi.fn(),
    },
    orgSettings: {
      findUnique: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    ticket: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  const mockRedis = {
    incr: vi.fn(),
    expire: vi.fn(),
  }

  const mockPinecone = {
    Index: vi.fn().mockReturnValue({
      namespace: vi.fn().mockReturnValue({
        query: vi.fn(),
      }),
    }),
  }

  return {
    prisma: mockPrisma,
    redisConnection: mockRedis,
    pinecone: mockPinecone,
  }
})

const globalFetch = globalThis.fetch

import { prisma, redisConnection } from '@repo/db'

describe('Live Chat Widget Endpoints', () => {
  const orgId = 'org_widget_123'
  const sessionId = '72c3d001-c81b-4171-8bc6-9462d7c07fe5'

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback(prisma)
    })
  })

  afterEach(() => {
    globalThis.fetch = globalFetch
  })

  describe('Origin verification', () => {
    it('should return 403 Forbidden when origin does not match allowed domains', async () => {
      vi.mocked(prisma.widgetConfig.findUnique).mockResolvedValueOnce({
        orgId,
        allowedDomains: ['trusted.com']
      } as any)

      const res = await app.request('/api/widget/chat', {
        method: 'POST',
        headers: {
          'Origin': 'http://untrusted.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          sessionId,
          message: 'Hello'
        })
      })

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toContain('Origin is not permitted')
    })

    it('should pass and process when origin matches allowed domains', async () => {
      vi.mocked(prisma.widgetConfig.findUnique).mockResolvedValueOnce({
        orgId,
        allowedDomains: ['trusted.com']
      } as any)
      vi.mocked(redisConnection.incr).mockResolvedValueOnce(1)
      vi.mocked(prisma.orgSettings.findUnique).mockResolvedValueOnce({
        orgId,
        vectorScoreThreshold: 0.75
      } as any)
      vi.mocked(prisma.conversation.findFirst).mockResolvedValueOnce({
        id: 'conv_1',
        orgId,
        sessionId,
        transcript: []
      } as any)

      const res = await app.request('/api/widget/chat', {
        method: 'POST',
        headers: {
          'Origin': 'https://trusted.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          sessionId,
          message: 'Hello'
        })
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    })
  })

  describe('Rate Limiting', () => {
    it('should return 429 Too Many Requests when rate limit is exceeded', async () => {
      vi.mocked(prisma.widgetConfig.findUnique).mockResolvedValueOnce({
        orgId,
        allowedDomains: ['trusted.com']
      } as any)
      vi.mocked(redisConnection.incr).mockResolvedValueOnce(16) // Limit is 15

      const res = await app.request('/api/widget/chat', {
        method: 'POST',
        headers: {
          'Origin': 'https://trusted.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          sessionId,
          message: 'Hello'
        })
      })

      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toContain('Rate limit exceeded')
    })
  })

  describe('POST /api/widget/escalate', () => {
    it('should successfully create an open support ticket linking the conversation', async () => {
      vi.mocked(prisma.widgetConfig.findUnique).mockResolvedValueOnce({
        orgId,
        allowedDomains: [] // Empty = bypass checks
      } as any)
      vi.mocked(prisma.conversation.findFirst).mockResolvedValueOnce({
        id: 'conv_1',
        orgId,
        sessionId,
        transcript: []
      } as any)
      vi.mocked(prisma.ticket.findUnique).mockResolvedValueOnce(null)
      vi.mocked(prisma.ticket.create).mockResolvedValueOnce({
        id: 'ticket_esc_999',
        status: 'OPEN'
      } as any)

      const res = await app.request('/api/widget/escalate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          sessionId,
          userEmail: 'user@example.com',
          userSummary: 'Widget conversation has stalled.'
        })
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.ticketId).toBe('ticket_esc_999')
      expect(body.status).toBe('OPEN')
    })
  })
})
