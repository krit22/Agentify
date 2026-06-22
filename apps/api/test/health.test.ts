import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../src/app.js'

// Mock the database dependency module
vi.mock('@repo/db', () => {
  return {
    prisma: {
      $queryRaw: vi.fn(),
    },
    pinecone: {
      listIndexes: vi.fn(),
    },
    redisConnection: {}, // Mock Redis connection singleton
  }
})

// Retrieve references to mocked clients
import { prisma, pinecone } from '@repo/db'

describe('GET /health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 200 and status healthy when database and vectorDb are active', async () => {
    // Arrange: Mock DB success
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([1])
    vi.mocked(pinecone.listIndexes).mockResolvedValueOnce({ indexes: [] } as any)

    // Act
    const res = await app.request('/health')
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.status).toBe('healthy')
    expect(body.services.database).toBe('UP')
    expect(body.services.vectorDb).toBe('UP')
  })

  it('should return 503 and status unhealthy when PostgreSQL is offline', async () => {
    // Arrange: Mock PG crash
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('Connection failed'))
    vi.mocked(pinecone.listIndexes).mockResolvedValueOnce({ indexes: [] } as any)

    // Act
    const res = await app.request('/health')
    const body = await res.json()

    // Assert
    expect(res.status).toBe(503)
    expect(body.status).toBe('unhealthy')
    expect(body.services.database).toBe('DOWN')
    expect(body.services.vectorDb).toBe('UP')
  })

  it('should return 503 and status unhealthy when Pinecone is offline', async () => {
    // Arrange: Mock Pinecone crash
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([1])
    vi.mocked(pinecone.listIndexes).mockRejectedValueOnce(new Error('API key expired'))

    // Act
    const res = await app.request('/health')
    const body = await res.json()

    // Assert
    expect(res.status).toBe(503)
    expect(body.status).toBe('unhealthy')
    expect(body.services.database).toBe('UP')
    expect(body.services.vectorDb).toBe('DOWN')
  })
})
