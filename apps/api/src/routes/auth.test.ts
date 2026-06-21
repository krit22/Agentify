import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../app.js'

// Mock database package
vi.mock('@repo/db', () => {
  const mockPrisma = {
    organization: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    orgSettings: {
      create: vi.fn(),
    },
    widgetConfig: {
      create: vi.fn(),
    },
    orgBillingUsage: {
      create: vi.fn(),
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

describe('POST /api/auth/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default prisma.$transaction mock helper executing the callback with the mock client
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback(prisma)
    })
  })

  it('should return 401 Unauthorized when mock headers are missing and Clerk is unconfigured', async () => {
    // Act
    const res = await app.request('/api/auth/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orgName: 'No Headers Co' }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toContain('Authentication required')
  })

  it('should return 400 Bad Request when the Zod schema payload (orgName) is missing', async () => {
    // Act
    const res = await app.request('/api/auth/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mock-org-id': '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        'x-mock-user-id': 'user_123',
      },
      body: JSON.stringify({}), // Empty body (violates Zod schema)
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('should return 201 Created and provision database records if organization does not exist', async () => {
    // Arrange: Org not found, return mock org on create transaction
    const orgId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
    const orgName = 'Aegis Test Corporation'
    
    vi.mocked(prisma.organization.findUnique)
      .mockResolvedValueOnce(null) // First lookup returns null
      .mockResolvedValueOnce({
        id: orgId,
        name: orgName,
        settings: { orgId, vectorScoreThreshold: 0.74 },
        widgetConfig: { orgId, brandColor: '#4F46E5' },
        billingUsage: { orgId, tier: 'FREE', storageBytes: BigInt(0), tokensConsumed: BigInt(0) },
      } as any) // Transaction fetch returns loaded object

    // Act
    const res = await app.request('/api/auth/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mock-org-id': orgId,
        'x-mock-user-id': 'user_123',
      },
      body: JSON.stringify({ orgName }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(201)
    expect(body.isNew).toBe(true)
    expect(body.organization.id).toBe(orgId)
    expect(body.organization.billingUsage.storageBytes).toBe('0') // Serialized from BigInt
  })

  it('should return 200 OK and return cached organization profile if it already exists', async () => {
    // Arrange: Org already exists in Postgres
    const orgId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
    const orgName = 'Aegis Test Corporation'
    
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
      id: orgId,
      name: orgName,
      settings: { orgId, vectorScoreThreshold: 0.74 },
      widgetConfig: { orgId, brandColor: '#4F46E5' },
      billingUsage: { orgId, tier: 'FREE', storageBytes: BigInt(100), tokensConsumed: BigInt(50) },
    } as any)

    // Act
    const res = await app.request('/api/auth/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mock-org-id': orgId,
        'x-mock-user-id': 'user_123',
      },
      body: JSON.stringify({ orgName }),
    })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.isNew).toBe(false)
    expect(body.organization.id).toBe(orgId)
    expect(body.organization.billingUsage.storageBytes).toBe('100')
  })
})
