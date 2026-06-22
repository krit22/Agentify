/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { app } from '../src/app.js'

vi.mock('@repo/db', () => {
  const mockPrisma = {
    ticket: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    conversation: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  return {
    prisma: mockPrisma,
    redisConnection: {},
  }
})

const globalFetch = globalThis.fetch

import { prisma } from '@repo/db'

describe('Support Inbox Endpoints', () => {
  const orgId = 'org_inbox_123'
  const ticketId = 'ticket_inbox_abc'

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = globalFetch
  })

  describe('GET /api/orgs/tickets', () => {
    it('should list paginated tickets', async () => {
      const mockTickets = [{ id: ticketId, orgId, status: 'OPEN', userSummary: 'Cant login' }]
      vi.mocked(prisma.ticket.findMany).mockResolvedValueOnce(mockTickets as any)
      vi.mocked(prisma.ticket.count).mockResolvedValueOnce(1)

      const res = await app.request('/api/orgs/tickets?page=1&limit=5', {
        method: 'GET',
        headers: {
          'x-mock-org-id': orgId,
          'x-mock-user-id': 'user_test'
        }
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.tickets).toHaveLength(1)
      expect(body.total).toBe(1)
      expect(body.totalPages).toBe(1)
    })
  })

  describe('GET /api/orgs/tickets/:ticketId', () => {
    it('should return ticket details', async () => {
      const mockTicket = { id: ticketId, orgId, status: 'OPEN', conversation: { id: 'conv_1', transcript: [] } }
      vi.mocked(prisma.ticket.findFirst).mockResolvedValueOnce(mockTicket as any)

      const res = await app.request(`/api/orgs/tickets/${ticketId}`, {
        method: 'GET',
        headers: {
          'x-mock-org-id': orgId,
          'x-mock-user-id': 'user_test'
        }
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe(ticketId)
      expect(body.conversation.id).toBe('conv_1')
    })
  })

  describe('POST /api/orgs/tickets/:ticketId/reply', () => {
    it('should append reply, update status to PENDING_CUSTOMER, and send email', async () => {
      const mockTicket = {
        id: ticketId,
        orgId,
        userContact: 'customer@example.com',
        userSummary: 'Summary text',
        conversation: { id: 'conv_1', transcript: [{ role: 'user', content: 'help' }] }
      }
      vi.mocked(prisma.ticket.findFirst).mockResolvedValueOnce(mockTicket as any)
      vi.mocked(prisma.ticket.update).mockResolvedValueOnce({
        id: ticketId,
        status: 'PENDING_CUSTOMER'
      } as any)

      process.env.RESEND_API_KEY = 're_test_key'
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'email_id_123' })
      } as any)

      const res = await app.request(`/api/orgs/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: {
          'x-mock-org-id': orgId,
          'x-mock-user-id': 'user_test',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'This is the rep reply' })
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('PENDING_CUSTOMER')
      expect(globalThis.fetch).toHaveBeenCalled()
    })
  })

  describe('POST /api/orgs/tickets/:ticketId/resolve', () => {
    it('should suggest resolution via OpenRouter', async () => {
      const mockTicket = {
        id: ticketId,
        orgId,
        userSummary: 'Broken reset button',
        conversation: {
          id: 'conv_1',
          transcript: [
            { role: 'user', content: 'Reset password button is not working.' },
            { role: 'assistant', content: 'We fixed it, please try again.' }
          ]
        }
      }
      vi.mocked(prisma.ticket.findFirst).mockResolvedValueOnce(mockTicket as any)

      process.env.OPENROUTER_API_KEY = 'or_test_key'
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestedQuestion: 'How to fix reset password button?',
                  suggestedAnswer: 'Try clicking the newly deployed button.'
                })
              }
            }
          ]
        })
      } as any)

      const res = await app.request(`/api/orgs/tickets/${ticketId}/resolve`, {
        method: 'POST',
        headers: {
          'x-mock-org-id': orgId,
          'x-mock-user-id': 'user_test'
        }
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.suggestedQuestion).toBe('How to fix reset password button?')
      expect(body.suggestedAnswer).toBe('Try clicking the newly deployed button.')
    })
  })
})
