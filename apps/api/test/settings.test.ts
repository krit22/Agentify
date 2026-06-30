/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../src/app.js'

vi.mock('@repo/db', () => {
  const mockPrisma = {
    organization: {
      findUnique: vi.fn(),
    },
    orgSettings: {
      update: vi.fn(),
    },
    widgetConfig: {
      update: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  const mockPinecone = {
    Index: vi.fn(() => ({
      namespace: vi.fn(() => ({
        deleteAll: vi.fn().mockResolvedValue(undefined),
      })),
      describeIndexStats: vi.fn().mockResolvedValue({
        namespaces: {
          org_123: { recordCount: 0 }
        }
      })
    })),
  }
  return {
    prisma: mockPrisma,
    pinecone: mockPinecone,
    redisConnection: {},
  }
})

vi.mock('../src/services/storage.js', () => {
  return {
    StorageService: {
      deleteFiles: vi.fn().mockResolvedValue(undefined),
    },
  }
})

import { prisma } from '@repo/db'

describe('GET /api/orgs/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback(prisma)
    })
  })

  it('should return 401 when missing auth credentials', async () => {
    const res = await app.request('/api/orgs/settings', { method: 'GET' })
    expect(res.status).toBe(401)
  })

  it('should return settings for valid organization', async () => {
    const mockOrg = {
      id: 'org_123',
      name: 'Test Org',
      settings: { vectorScoreThreshold: 0.74, defaultTicketUrgency: 'med', escalationSLAHours: 24 },
      widgetConfig: { brandColor: '#4F46E5', logoUrl: null, widgetPosition: 'right', greetingMessage: 'Hi!', allowedDomains: [] }
    }
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(mockOrg as any)

    const res = await app.request('/api/orgs/settings', {
      method: 'GET',
      headers: {
        'x-mock-org-id': 'org_123',
        'x-mock-user-id': 'user_123'
      }
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orgId).toBe('org_123')
    expect(body.settings.vectorScoreThreshold).toBe(0.74)
  })
})

describe('PATCH /api/orgs/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback(prisma)
    })
  })

  it('should atomically update organization settings and widget config', async () => {
    const mockOrg = {
      id: 'org_123',
      name: 'Test Org',
      settings: { vectorScoreThreshold: 0.8, defaultTicketUrgency: 'high', escalationSLAHours: 12 },
      widgetConfig: { brandColor: '#FF0000', logoUrl: null, widgetPosition: 'left', greetingMessage: 'Hello updated!', allowedDomains: [] }
    }
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)

    const res = await app.request('/api/orgs/settings', {
      method: 'PATCH',
      headers: {
        'x-mock-org-id': 'org_123',
        'x-mock-user-id': 'user_123',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        settings: { vectorScoreThreshold: 0.8, defaultTicketUrgency: 'high' },
        widgetConfig: { brandColor: '#FF0000', greetingMessage: 'Hello updated!' }
      })
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.settings.vectorScoreThreshold).toBe(0.8)
    expect(body.widgetConfig.brandColor).toBe('#FF0000')

    expect(prisma.orgSettings.update).toHaveBeenCalled()
    expect(prisma.widgetConfig.update).toHaveBeenCalled()
  })
})

describe('POST /api/orgs/settings/clear-knowledge-base', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when missing auth credentials', async () => {
    const res = await app.request('/api/orgs/settings/clear-knowledge-base', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('should successfully delete all files and clear vector store and documents', async () => {
    const mockDocuments = [
      { id: 'doc_1', title: 'guide.pdf' },
      { id: 'doc_2', title: 'api.md' }
    ]
    vi.mocked(prisma.document.findMany).mockResolvedValueOnce(mockDocuments as any)
    vi.mocked(prisma.document.deleteMany).mockResolvedValueOnce({ count: 2 } as any)
    vi.mocked(prisma.document.count).mockResolvedValueOnce(0)

    const res = await app.request('/api/orgs/settings/clear-knowledge-base', {
      method: 'POST',
      headers: {
        'x-mock-org-id': 'org_123',
        'x-mock-user-id': 'user_123'
      }
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe('Knowledge base cleared successfully.')
    expect(body.remainingDbDocs).toBe(0)
    expect(body.remainingVectors).toBe(0)

    // Ensure documents were fetched for storage deletion names resolving
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_123' },
      select: { id: true, title: true }
    })

    // Ensure documents were deleted
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({
      where: { orgId: 'org_123' }
    })

    // Ensure final count check ran
    expect(prisma.document.count).toHaveBeenCalledWith({
      where: { orgId: 'org_123' }
    })
  })
})
