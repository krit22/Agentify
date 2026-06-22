import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../src/app.js'

// Mock database package
vi.mock('@repo/db', () => {
  const mockPrisma = {
    document: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  return {
    prisma: mockPrisma,
    pinecone: {
      listIndexes: vi.fn(),
    },
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

describe('POST /api/orgs/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 Unauthorized when mock headers are missing', async () => {
    // Act
    const res = await app.request('/api/orgs/documents', {
      method: 'POST',
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toContain('Authentication required')
  })

  it('should return 400 Bad Request when no file is uploaded', async () => {
    // Arrange: Empty form payload
    const formData = new FormData()

    // Act
    const res = await app.request('/api/orgs/documents', {
      method: 'POST',
      headers: {
        'x-mock-org-id': 'org_test_123',
        'x-mock-user-id': 'user_test_123',
      },
      body: formData,
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toContain('Missing or invalid file')
  })

  it('should upload successfully, create document metadata and enqueue layout extraction job', async () => {
    // Arrange: Create simulated file and form payload
    const mockFile = new File(['dummy binary text content'], 'billing_policy.pdf', {
      type: 'application/pdf',
    })
    const formData = new FormData()
    formData.append('file', mockFile)

    const orgId = 'org_test_123'
    const signedUrl = 'https://supabase.co/storage/v1/object/sign/documents/doc_uuid_123.pdf'

    vi.mocked(StorageService.saveFile).mockResolvedValueOnce({
      fileUrl: signedUrl,
      fileSize: mockFile.size,
      extension: '.pdf',
    })

    vi.mocked(prisma.document.create).mockResolvedValueOnce({
      id: 'doc_uuid_123',
      orgId,
      title: 'billing_policy.pdf',
      sourceUrl: signedUrl,
      status: 'QUEUED',
      fileSize: mockFile.size,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    // Act
    const res = await app.request('/api/orgs/documents', {
      method: 'POST',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': 'user_test_123',
      },
      body: formData,
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(202)
    expect(body.documentId).toBe('doc_uuid_123')
    expect(body.status).toBe('QUEUED')

    expect(StorageService.saveFile).toHaveBeenCalledWith(expect.any(File), expect.any(String))
    expect(prisma.document.create).toHaveBeenCalled()
    expect(QueueService.enqueueIngestion).toHaveBeenCalledWith({
      documentId: 'doc_uuid_123',
      orgId,
      fileUrl: signedUrl,
      fileName: 'billing_policy.pdf',
    })
  })
})
