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
    $transaction: vi.fn(),
  }
  return {
    prisma: mockPrisma,
    redisConnection: {},
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
