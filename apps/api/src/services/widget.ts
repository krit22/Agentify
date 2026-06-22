import { prisma, pinecone, redisConnection } from '@repo/db'

export interface VectorChunkMatch {
  score: number
  content: string
  documentId: string
  pageNumber: number | null
  sectionHeader: string
}

export class WidgetService {
  /**
   * Verifies that the request Origin or Referer matches the allowlist in WidgetConfig.
   */
  public static async verifyOrigin(orgId: string, originHeader?: string, refererHeader?: string): Promise<boolean> {
    const config = await prisma.widgetConfig.findUnique({
      where: { orgId },
    })

    if (!config) {
      throw new Error(`Widget configuration not found for organization ${orgId}.`)
    }

    // If allowedDomains is empty or contains '*', bypass origin checking (helpful in dev/testing)
    if (!config.allowedDomains || config.allowedDomains.length === 0 || config.allowedDomains.includes('*')) {
      return true
    }

    const hostToCheck = originHeader || refererHeader
    if (!hostToCheck) {
      return false
    }

    let hostname = hostToCheck
    if (hostname.includes('://')) {
      try {
        const url = new URL(hostname)
        hostname = url.hostname
      } catch {
        hostname = hostname.split('://')[1].split('/')[0].split(':')[0]
      }
    } else {
      hostname = hostname.split('/')[0].split(':')[0]
    }

    const isAllowed = config.allowedDomains.some((domain) => {
      const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split(':')[0]
      const cleanHost = hostname.replace(/^(www\.)?/, '')
      return cleanHost === cleanDomain || cleanHost.endsWith('.' + cleanDomain)
    })

    return isAllowed
  }

  /**
   * Evaluates IP rate limit using Redis. Limit: 15 hits per 60s window.
   */
  public static async checkRateLimit(ip: string): Promise<boolean> {
    const key = `ratelimit:chat:${ip}`
    const limit = 15
    const window = 60

    try {
      const current = await redisConnection.incr(key)
      if (current === 1) {
        await redisConnection.expire(key, window)
      }
      return current <= limit
    } catch (e) {
      console.error('[REDIS RATE LIMIT ERROR] Failsafe: rate limit check failed.', e)
      return true // Fail-open
    }
  }

  /**
   * Queries OpenRouter embeddings and searches Pinecone vector namespace.
   */
  public static async queryPinecone(orgId: string, queryText: string): Promise<VectorChunkMatch[]> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      console.warn('OPENROUTER_API_KEY is not defined. Returning empty chunk matches.')
      return []
    }

    try {
      // 1. Generate embeddings via OpenRouter
      const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
          input: [queryText],
        }),
      })

      if (!response.ok) {
        console.error('Embeddings generation failed:', await response.text())
        return []
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resBody: any = await response.json()
      const embedding = resBody.data?.[0]?.embedding
      if (!embedding) {
        return []
      }

      // 2. Query Pinecone
      const indexName = process.env.PINECONE_INDEX || 'aegis-ai'
      const index = pinecone.Index(indexName)
      const queryResult = await index.namespace(orgId).query({
        vector: embedding,
        topK: 5,
        includeMetadata: true,
      })

      return (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queryResult.matches?.map((m: any) => ({
          score: m.score || 0,
          content: m.metadata?.rawContent || '',
          documentId: m.metadata?.documentId || '',
          pageNumber: m.metadata?.pageNumber || null,
          sectionHeader: m.metadata?.sectionHeader || '',
        })) || []
      )
    } catch (e) {
      console.error('Pinecone search failed:', e)
      return []
    }
  }

  /**
   * Escalates the conversation to an open support ticket.
   */
  public static async escalateConversation(params: {
    orgId: string
    sessionId: string
    userEmail: string
    userSummary: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aiDebugData?: any
  }) {
    const { orgId, sessionId, userEmail, userSummary, aiDebugData } = params

    // 1. Fetch or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { orgId, sessionId },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          orgId,
          sessionId,
          transcript: [],
        },
      })
    }

    // 2. Perform updates and ticket creation in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check if ticket already exists for this conversation
      const existingTicket = await tx.ticket.findUnique({
        where: { conversationId: conversation.id },
      })

      if (existingTicket) {
        return existingTicket
      }

      // Update conversation with endUserEmail
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { endUserEmail: userEmail },
      })

      // Create the ticket
      const ticket = await tx.ticket.create({
        data: {
          orgId,
          conversationId: conversation.id,
          status: 'OPEN',
          userSummary,
          userContact: userEmail,
          aiDebugData: aiDebugData || {
            escalatedFromWidget: true,
            escalationReason: 'User initiated widget escalation',
          },
        },
      })

      return ticket
    })

    return result
  }
}
