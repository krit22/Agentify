import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../src/app.js'

// Mock database package
vi.mock('@repo/db', () => {
  const mockPrisma = {
    document: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  return {
    prisma: mockPrisma,
    pinecone: {
      listIndexes: vi.fn(),
    },
  }
})

import { prisma } from '@repo/db'

describe('GET /api/orgs/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default prisma.$transaction mock helper executing either the callback or Promise.all for arrays
    vi.mocked(prisma.$transaction).mockImplementation(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg)
      }
      return arg(prisma)
    })
  })

  it('should return 401 Unauthorized when mock headers are missing and Clerk is unconfigured', async () => {
    // Act
    const res = await app.request('/api/orgs/documents')
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toContain('Authentication required')
  })

  it('should return 400 Bad Request when query validation fails (e.g., page < 1)', async () => {
    // Act
    const res = await app.request('/api/orgs/documents?page=0&limit=20', {
      method: 'GET',
      headers: {
        'x-mock-org-id': 'org_test_123',
        'x-mock-user-id': 'user_test_123',
      },
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('should return 400 Bad Request when limit exceeds 100', async () => {
    // Act
    const res = await app.request('/api/orgs/documents?limit=101', {
      method: 'GET',
      headers: {
        'x-mock-org-id': 'org_test_123',
        'x-mock-user-id': 'user_test_123',
      },
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('should return 200 OK and list of documents matching tenant organization', async () => {
    // Arrange: Mock DB returns
    const orgId = 'org_test_123'
    const mockDocs = [
      {
        id: 'doc_uuid_1',
        orgId,
        title: 'Security_Guidelines.pdf',
        sourceUrl: 'https://r2.aegis.ai/Security_Guidelines.pdf',
        status: 'READY',
        fileSize: 2048576,
        version: 1,
        createdAt: new Date('2026-06-22T08:00:00Z'),
        updatedAt: new Date('2026-06-22T08:00:00Z'),
      },
    ]

    vi.mocked(prisma.document.findMany).mockResolvedValueOnce(mockDocs as any)
    vi.mocked(prisma.document.count).mockResolvedValueOnce(1)

    // Act
    const res = await app.request('/api/orgs/documents?page=1&limit=10&status=READY', {
      method: 'GET',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': 'user_test_123',
      },
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.documents).toHaveLength(1)
    expect(body.documents[0].title).toBe('Security_Guidelines.pdf')
    expect(body.pagination.totalCount).toBe(1)
    expect(body.pagination.totalPages).toBe(1)

    // Verify transactional parameters mapping
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        orgId,
        status: 'READY',
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: 0,
      take: 10,
    })
  })
})
