/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../src/app.js'

vi.mock('@repo/db', () => {
  const mockPrisma = {
    ticket: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  }
  return {
    prisma: mockPrisma,
    redisConnection: {},
  }
})

import { prisma } from '@repo/db'

describe('POST /api/webhooks/inbound-email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 400 Bad Request when missing essential fields', async () => {
    const res = await app.request('/api/webhooks/inbound-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'customer@example.com'
      })
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Missing required webhook fields')
  })

  it('should return 202 and skip if destination email format is invalid', async () => {
    const res = await app.request('/api/webhooks/inbound-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'customer@example.com',
        to: 'invalid-email-format@inbound.aegis.ai',
        subject: 'Re: ticket',
        text: 'This is a test reply'
      })
    })

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.error).toContain('did not match ticket UUID pattern')
  })

  it('should successfully append customer reply to conversation and reopen ticket', async () => {
    const ticketId = 'da1e7215-6b5d-45fc-ae55-c54dfc4aeae5'
    const mockTicket = {
      id: ticketId,
      status: 'PENDING_CUSTOMER',
      conversation: {
        id: 'conv_123',
        transcript: [{ role: 'assistant', content: 'Support rep response' }]
      }
    }

    vi.mocked(prisma.ticket.findUnique).mockResolvedValueOnce(mockTicket as any)
    vi.mocked(prisma.ticket.update).mockResolvedValueOnce({} as any)

    const res = await app.request('/api/webhooks/inbound-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'customer@example.com',
        to: `${ticketId}@inbound.aegis.ai`,
        subject: 'Re: My password reset',
        text: 'This is my follow-up reply!'
      })
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticketId).toBe(ticketId)

    expect(prisma.ticket.findUnique).toHaveBeenCalledWith({
      where: { id: ticketId },
      include: { conversation: true }
    })

    expect(prisma.ticket.update).toHaveBeenCalledWith({
      where: { id: ticketId },
      data: {
        status: 'OPEN',
        conversation: {
          update: {
            transcript: [
              { role: 'assistant', content: 'Support rep response' },
              { role: 'user', content: 'This is my follow-up reply!' }
            ]
          }
        }
      }
    })
  })
})
