/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../src/app.js'

// Mock database package
vi.mock('@repo/db', () => {
  const mockPrisma = {
    ticket: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    document: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  return {
    prisma: mockPrisma,
    redisConnection: {}, // Mock redis connection
  }
})

// Mock upload storage service (Supabase)
vi.mock('../src/services/storage.js', () => {
  return {
    StorageService: {
      saveFile: vi.fn(),
    },
  }
})

// Mock BullMQ publisher queue service
vi.mock('../src/services/queue.js', () => {
  return {
    QueueService: {
      enqueueIngestion: vi.fn(),
    },
  }
})

import { prisma } from '@repo/db'
import { StorageService } from '../src/services/storage.js'
import { QueueService } from '../src/services/queue.js'

describe('POST /api/orgs/tickets/:ticketId/harvest', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default prisma.$transaction mock helper executing the callback
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback(prisma)
    })
  })

  it('should return 401 Unauthorized when auth headers are missing', async () => {
    // Act
    const res = await app.request('/api/orgs/tickets/ticket_123/harvest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publish: true,
        question: 'How do I change billing cycle?',
        answer: 'Navigate to organization settings under billing usage dashboard.',
      }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toContain('Authentication required')
  })

  it('should return 404 Not Found when target ticket does not exist for the org', async () => {
    // Arrange
    vi.mocked(prisma.ticket.findFirst).mockResolvedValueOnce(null)

    // Act
    const res = await app.request('/api/orgs/tickets/ticket_missing/harvest', {
      method: 'POST',
      headers: {
        'x-mock-org-id': 'org_test_123',
        'x-mock-user-id': 'user_test_123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publish: true,
        question: 'How do I change billing cycle?',
        answer: 'Navigate to organization settings under billing usage dashboard.',
      }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(404)
    expect(body.error).toContain('not found')
    expect(prisma.ticket.findFirst).toHaveBeenCalledWith({
      where: { id: 'ticket_missing', orgId: 'org_test_123' },
    })
  })

  it('should resolve ticket and skip publishing document when publish is false', async () => {
    // Arrange
    const orgId = 'org_test_123'
    const ticketId = 'ticket_uuid_1'
    const mockTicket = { id: ticketId, orgId, status: 'OPEN' }
    const updatedTicket = { id: ticketId, orgId, status: 'RESOLVED' }

    vi.mocked(prisma.ticket.findFirst).mockResolvedValueOnce(mockTicket as any)
    vi.mocked(prisma.ticket.update).mockResolvedValueOnce(updatedTicket as any)

    // Act
    const res = await app.request(`/api/orgs/tickets/${ticketId}/harvest`, {
      method: 'POST',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': 'user_test_123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publish: false,
        question: 'How do I change billing cycle?',
        answer: 'Navigate to organization settings under billing usage dashboard.',
      }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.ticketId).toBe(ticketId)
    expect(body.status).toBe('RESOLVED')
    expect(body.published).toBe(false)
    expect(body.documentId).toBeNull()

    expect(prisma.ticket.update).toHaveBeenCalledWith({
      where: { id: ticketId },
      data: {
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
        harvestedQ: 'How do I change billing cycle?',
        harvestedA: 'Navigate to organization settings under billing usage dashboard.',
        harvestedAt: expect.any(Date),
      },
    })
    expect(StorageService.saveFile).not.toHaveBeenCalled()
    expect(prisma.document.create).not.toHaveBeenCalled()
    expect(QueueService.enqueueIngestion).not.toHaveBeenCalled()
  })

  it('should resolve ticket, generate synthetic document, upload and enqueue ingestion when publish is true', async () => {
    // Arrange
    const orgId = 'org_test_123'
    const ticketId = 'ticket_uuid_2'
    const mockTicket = { id: ticketId, orgId, status: 'OPEN' }
    const updatedTicket = { id: ticketId, orgId, status: 'RESOLVED' }
    const docId = 'doc_synthetic_uuid'
    const fileUrl = 'https://supabase.storage/synthetic_qa.md'

    vi.mocked(prisma.ticket.findFirst).mockResolvedValueOnce(mockTicket as any)
    vi.mocked(prisma.ticket.update).mockResolvedValueOnce(updatedTicket as any)
    vi.mocked(StorageService.saveFile).mockResolvedValueOnce({
      fileUrl,
      fileSize: 120,
      extension: '.md',
    })
    vi.mocked(prisma.document.create).mockResolvedValueOnce({
      id: docId,
      orgId,
      title: `synthetic_qa_${ticketId}.md`,
      status: 'QUEUED',
      sourceUrl: fileUrl,
    } as any)

    // Act
    const res = await app.request(`/api/orgs/tickets/${ticketId}/harvest`, {
      method: 'POST',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': 'user_test_123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publish: true,
        question: 'How do I change billing cycle?',
        answer: 'Navigate to organization settings under billing usage dashboard.',
      }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.ticketId).toBe(ticketId)
    expect(body.status).toBe('RESOLVED')
    expect(body.published).toBe(true)
    expect(body.documentId).toBe(docId)
    expect(body.documentStatus).toBe('QUEUED')

    expect(StorageService.saveFile).toHaveBeenCalledWith(
      expect.any(File),
      expect.any(String)
    )
    expect(prisma.document.create).toHaveBeenCalled()
    expect(QueueService.enqueueIngestion).toHaveBeenCalledWith({
      documentId: docId,
      orgId,
      fileUrl,
      fileName: `synthetic_qa_${ticketId}.md`,
    })
  })

  it('should return 400 Bad Request when question payload is too short', async () => {
    // Act
    const res = await app.request('/api/orgs/tickets/ticket_123/harvest', {
      method: 'POST',
      headers: {
        'x-mock-org-id': 'org_test_123',
        'x-mock-user-id': 'user_test_123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publish: true,
        question: 'Short Q',
        answer: 'Navigate to organization settings under billing usage dashboard.',
      }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('should return 400 Bad Request when answer payload is too short', async () => {
    // Act
    const res = await app.request('/api/orgs/tickets/ticket_123/harvest', {
      method: 'POST',
      headers: {
        'x-mock-org-id': 'org_test_123',
        'x-mock-user-id': 'user_test_123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publish: true,
        question: 'How do I change billing cycle?',
        answer: 'Short A',
      }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })
})
