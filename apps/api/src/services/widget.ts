import { prisma, pinecone, redisConnection } from '@repo/db'
import type { FusedChunk, LexicalChunkCandidate } from '../types/widget.js'

export interface VectorChunkMatch {
  id: string
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
          id: m.id.replace(/^chunk_/, ''),
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

  /**
   * Runs Reciprocal Rank Fusion (RRF) on dense and lexical search results.
   */
  public static applyRRF(
    dense: VectorChunkMatch[],
    lexical: LexicalChunkCandidate[],
    k = 60
  ): FusedChunk[] {
    const scores: Record<string, { chunk: FusedChunk; score: number }> = {}

    // 1. Process dense results
    dense.forEach((item, index) => {
      const rank = index + 1
      const chunkId = item.id
      if (!scores[chunkId]) {
        scores[chunkId] = {
          chunk: {
            id: chunkId,
            documentId: item.documentId,
            pageNumber: item.pageNumber,
            sectionHeader: item.sectionHeader,
            rawContent: item.content,
            rrfScore: 0,
          },
          score: 0,
        }
      }
      scores[chunkId].score += 1 / (k + rank)
    })

    // 2. Process lexical results
    lexical.forEach((item, index) => {
      const rank = index + 1
      const chunkId = item.id
      if (!scores[chunkId]) {
        scores[chunkId] = {
          chunk: {
            id: chunkId,
            documentId: item.documentId,
            pageNumber: item.pageNumber,
            sectionHeader: item.sectionHeader,
            rawContent: item.rawContent,
            rrfScore: 0,
          },
          score: 0,
        }
      }
      scores[chunkId].score += 1 / (k + rank)
    })

    // Convert back to array, assign computed scores, and sort descending
    return Object.values(scores)
      .map((entry) => {
        entry.chunk.rrfScore = entry.score
        return entry.chunk
      })
      .sort((a, b) => b.rrfScore - a.rrfScore)
  }

  /**
   * Generates alternate queries for query expansion via OpenRouter.
   */
  public static async expandQuery(queryText: string): Promise<string[]> {
    if (process.env.IS_E2E_TEST === 'true') {
      return [queryText]
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      console.warn('OPENROUTER_API_KEY is not defined. Skipping query expansion.')
      return [queryText]
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'poolside/laguna-m.1:free',
          messages: [
            {
              role: 'system',
              content: `You are a search query expansion assistant. Your task is to analyze the user's input query and return a JSON array containing exactly 2 or 3 alternative search queries optimized for keyword and semantic lookup.
Return ONLY a valid JSON array of strings (e.g., ["alternative 1", "alternative 2"]). Do not include any explanation or markdown formatting in your response.`,
            },
            {
              role: 'user',
              content: queryText,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 200,
        }),
      })

      if (!response.ok) {
        console.error('Query expansion API request failed:', await response.text())
        return [queryText]
      }

      const body: any = await response.json()
      const text = body.choices?.[0]?.message?.content?.trim() || ''
      if (text) {
        const cleanJson = text.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleanJson)
        if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) {
          return Array.from(new Set([queryText, ...parsed]))
        }
      }
      return [queryText]
    } catch (err) {
      console.error('Query expansion failed, falling back to original query:', err)
      return [queryText]
    }
  }

  /**
   * Performs lexical keyword FTS query against PostgreSQL for multiple query variants.
   */
  public static async queryPostgresFTS(
    orgId: string,
    queries: string[]
  ): Promise<LexicalChunkCandidate[]> {
    try {
      if (queries.length === 0) {
        return []
      }

      const tsQueryString = queries.join(' OR ')

      const results: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
          c.id, 
          c."documentId", 
          c."pageNumber", 
          c."sectionHeader", 
          c."rawContent",
          ts_rank_cd(to_tsvector('english', c."rawContent"), websearch_to_tsquery('english', $1)) as rank
        FROM "DocumentChunk" c
        JOIN "Document" d ON c."documentId" = d.id
        WHERE d."orgId" = $2
          AND to_tsvector('english', c."rawContent") @@ websearch_to_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT 50;
      `, tsQueryString, orgId)

      return results.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        pageNumber: r.pageNumber,
        sectionHeader: r.sectionHeader,
        rawContent: r.rawContent,
        rank: Number(r.rank) || 0,
      }))
    } catch (e) {
      console.error('[DATABASE FTS ERROR] FTS search failed:', e)
      return []
    }
  }

  /**
   * Batch generates embeddings and queries Pinecone for multiple query variants.
   */
  public static async queryPineconeBatched(
    orgId: string,
    queries: string[]
  ): Promise<VectorChunkMatch[]> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey || queries.length === 0) {
      return []
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
          input: queries,
        }),
      })

      if (!response.ok) {
        console.error('Embeddings batch generation failed:', await response.text())
        return []
      }

      const resBody: any = await response.json()
      const embeddings: number[][] = resBody.data?.map((d: any) => d.embedding) || []
      if (embeddings.length === 0) {
        return []
      }

      const indexName = process.env.PINECONE_INDEX || 'aegis-ai'
      const index = pinecone.Index(indexName)

      const queryPromises = embeddings.map((embedding) =>
        index.namespace(orgId).query({
          vector: embedding,
          topK: 25,
          includeMetadata: true,
        })
      )

      const queryResults = await Promise.all(queryPromises)
      const chunkMap: Record<string, VectorChunkMatch> = {}

      for (const res of queryResults) {
        if (!res.matches) continue
        for (const m of res.matches) {
          const chunkId = m.id.replace(/^chunk_/, '')
          const score = m.score || 0

          if (!chunkMap[chunkId] || chunkMap[chunkId].score < score) {
            chunkMap[chunkId] = {
              id: chunkId,
              score,
              content: (m.metadata?.rawContent as string) || '',
              documentId: (m.metadata?.documentId as string) || '',
              pageNumber: typeof m.metadata?.pageNumber === 'number' ? m.metadata.pageNumber : null,
              sectionHeader: (m.metadata?.sectionHeader as string) || '',
            }
          }
        }
      }

      return Object.values(chunkMap).sort((a, b) => b.score - a.score)
    } catch (e) {
      console.error('Batched Pinecone search failed:', e)
      return []
    }
  }

  /**
   * Reranks candidates using OpenRouter's neural cross-encoder reranker.
   */
  public static async rerankCandidates(
    queryText: string,
    candidates: FusedChunk[],
    topN = 5
  ): Promise<VectorChunkMatch[]> {
    if (process.env.IS_E2E_TEST === 'true' || !process.env.OPENROUTER_API_KEY || candidates.length === 0) {
      return candidates.slice(0, topN).map((c) => ({
        id: c.id,
        score: process.env.IS_E2E_TEST === 'true' ? 0.95 : c.rrfScore,
        content: c.rawContent,
        documentId: c.documentId,
        pageNumber: c.pageNumber,
        sectionHeader: c.sectionHeader || '',
      }))
    }

    const apiKey = process.env.OPENROUTER_API_KEY

    try {
      const documents = candidates.map((c) => c.rawContent)

      const response = await fetch('https://openrouter.ai/api/v1/rerank', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aegis.ai',
          'X-Title': 'Aegis AI',
        },
        body: JSON.stringify({
          model: 'nvidia/llama-nemotron-rerank-vl-1b-v2:free',
          query: queryText,
          documents: documents,
          top_n: topN,
        }),
      })

      if (!response.ok) {
        console.error('Rerank API request failed:', await response.text())
        return candidates.slice(0, topN).map((c) => ({
          id: c.id,
          score: c.rrfScore,
          content: c.rawContent,
          documentId: c.documentId,
          pageNumber: c.pageNumber,
          sectionHeader: c.sectionHeader || '',
        }))
      }

      const resBody: any = await response.json()
      const results: any[] = resBody.results || []

      const rerankedMatches: VectorChunkMatch[] = results.map((r: any) => {
        const candidate = candidates[r.index]
        return {
          id: candidate.id,
          score: r.relevance_score,
          content: candidate.rawContent,
          documentId: candidate.documentId,
          pageNumber: candidate.pageNumber,
          sectionHeader: candidate.sectionHeader || '',
        }
      })

      return rerankedMatches
    } catch (e) {
      console.error('Reranking failed, falling back to top RRF candidates:', e)
      return candidates.slice(0, topN).map((c) => ({
        id: c.id,
        score: c.rrfScore,
        content: c.rawContent,
        documentId: c.documentId,
        pageNumber: c.pageNumber,
        sectionHeader: c.sectionHeader || '',
      }))
    }
  }

  /**
   * Classifies user queries to skip retrieval for greetings, pleasantries, or identity questions.
   */
  public static async routeIntent(message: string): Promise<boolean> {
    if (process.env.IS_E2E_TEST === 'true') {
      const isGreeting = /^(hello|hi|thanks|thank you|hey|greetings)/i.test(message.trim())
      return !isGreeting
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      console.warn('OPENROUTER_API_KEY is not defined. Defaulting needsRetrieval = true.')
      return true
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'poolside/laguna-m.1:free',
        messages: [
          {
            role: 'system',
            content: `You are an intent routing assistant. Your job is to classify if the user's message is a greeting, pleasantry, or small talk that can be answered directly without looking up any documents, or if it is a question requesting information, facts, data, details, or summaries.

Strictly classify as "NO" (no lookup needed) only if the message is:
- A greeting (e.g., "hi", "hello", "hey", "good morning")
- A pleasantry or sign-off (e.g., "thanks", "thank you", "bye", "awesome")
- Simple small talk/metadata about you (e.g., "how are you", "who are you", "what is your name", "tell me a joke")

Classify as "YES" (lookup required) if the message:
- Asks any question about people, dates, documents, setups, policies, codes, certificates, or facts (e.g., "tell me the date of birth of Krit", "what is the SLA", "how do I change my settings").
- Requests any specific information or data lookup, even if brief or generic.

Examples:
- "hello" -> NO
- "tell me the date of birth of Krit" -> YES
- "how are you today?" -> NO
- "what is my account number?" -> YES
- "who is Krit?" -> YES
- "thanks for the help" -> NO
- "what is the safety policy for confined spaces?" -> YES

Respond with exactly "YES" or "NO". Do not include any explanation, markdown, or extra text.`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.0,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Intent Routing API request failed: ${errText}`)
    }

    const body: any = await response.json()
    const content = body.choices?.[0]?.message?.content?.trim() || ''
    const reasoning = body.choices?.[0]?.message?.reasoning?.trim() || ''

    if (content) {
      return content.toUpperCase().includes('YES')
    }

    if (reasoning) {
      const upperReason = reasoning.toUpperCase()
      const lastYes = upperReason.lastIndexOf('YES')
      const lastNo = upperReason.lastIndexOf('NO')
      if (lastYes !== -1 || lastNo !== -1) {
        return lastYes > lastNo
      }
    }

    // Fail-safe default: run RAG to prevent false negatives
    return true
  }

  /**
   * Verify if the retrieved context actually contains the answer to the user's question, reducing LLM hallucinations.
   */
  public static async checkAnswerability(
    queryText: string,
    matches: VectorChunkMatch[]
  ): Promise<boolean> {
    if (process.env.IS_E2E_TEST === 'true') {
      return matches.length > 0
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      console.warn('OPENROUTER_API_KEY is not defined. Defaulting isAnswerable = true.')
      return true
    }

    if (matches.length === 0) {
      return false
    }

    const contextText = matches
      .map((m, idx) => `[Chunk ${idx + 1}]:\n${m.content}`)
      .join('\n\n')

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'poolside/laguna-m.1:free',
        messages: [
          {
            role: 'system',
            content: `Analyze the retrieved context chunks and the user's question. Determine if the context contains enough factual information to answer the question accurately.
Respond with exactly "YES" if it can be answered, or "NO" if it cannot be answered due to missing or insufficient information.
Do not include any explanation, markdown, or other text.

Context Chunks:
${contextText}`,
          },
          {
            role: 'user',
            content: queryText,
          },
        ],
        temperature: 0.0,
        max_tokens: 100,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Answerability Check API request failed: ${errText}`)
    }

    const body: any = await response.json()
    const text = body.choices?.[0]?.message?.content?.trim() || ''
    return text.toUpperCase().includes('YES')
  }
}
